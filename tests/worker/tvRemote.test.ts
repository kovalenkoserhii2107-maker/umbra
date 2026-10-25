import { beforeAll, describe, expect, it } from "vitest";
import { handle } from "../../worker/src/index";
import {
  DEVICE_TTL,
  MAX_DEVICES,
  applyDevices,
  type Device,
  type DeviceOp,
  type DeviceStore,
} from "../../worker/src/tvRemote";
import type { CacheLike, Deps } from "../../worker/src/env";

const SITE = "https://kovalenkoserhii2107-maker.github.io";
const PROJECT = "umbra-18ba8";
const NOW = Date.UTC(2026, 9, 25, 10);
const FCM = `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`;

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === "string" ? bytes : String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const rsa = () =>
  crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  ) as Promise<CryptoKeyPair>;

let firebaseKeys: CryptoKeyPair;
let firebaseJwk: JsonWebKey;
let serviceAccount: string;

beforeAll(async () => {
  firebaseKeys = await rsa();
  firebaseJwk = await crypto.subtle.exportKey("jwk", firebaseKeys.publicKey);
  const service = await rsa();
  const der = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", service.privateKey),
  );
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))
    .match(/.{1,64}/g)!
    .join("\n")}\n-----END PRIVATE KEY-----\n`;
  serviceAccount = JSON.stringify({
    client_email: "firebase-adminsdk@umbra-18ba8.iam.gserviceaccount.com",
    private_key: pem,
  });
});

async function idToken(uid: string) {
  const head = b64url(JSON.stringify({ alg: "RS256", kid: "key-1" }));
  const body = b64url(
    JSON.stringify({
      aud: PROJECT,
      iss: `https://securetoken.google.com/${PROJECT}`,
      sub: uid,
      iat: NOW / 1000 - 60,
      exp: NOW / 1000 + 3000,
    }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    firebaseKeys.privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

function memoryCache(): CacheLike {
  const store = new Map<string, string>();
  return {
    async match(key) {
      const body = store.get(key.url);
      return body === undefined ? undefined : new Response(body);
    },
    async put(key, response) {
      store.set(key.url, await response.text());
    },
  };
}

const tv = (id: string, extra: Partial<Device> = {}) => ({
  id,
  token: `token-of-${id}-0123456789`,
  device: "BRAVIA 4K VH21",
  lampa: true,
  background: true,
  ...extra,
});

function setup() {
  const accounts = new Map<string, Device[]>();
  const devices: DeviceStore = (uid) => ({
    async run(op: DeviceOp) {
      const next = applyDevices(accounts.get(uid) ?? [], op, NOW);
      accounts.set(uid, next);
      return next;
    },
  });
  const pushes: Array<{ auth: string | null; body: any }> = [];
  /** Push tokens FCM no longer knows (the app was removed from that TV). */
  const gone = new Set<string>();
  let oauthCalls = 0;
  const pending: Promise<unknown>[] = [];
  const deps: Deps = {
    env: {
      ALLOWED_ORIGINS: SITE,
      FIREBASE_PROJECT_ID: PROJECT,
      FIREBASE_SERVICE_ACCOUNT: serviceAccount,
    },
    pairing: () => ({ run: async () => ({ ok: false, error: "not_found" }) }),
    devices,
    cache: memoryCache(),
    now: () => NOW,
    waitUntil: (task) => pending.push(task),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("securetoken@system.gserviceaccount.com"))
        return Response.json({
          keys: [{ ...firebaseJwk, kid: "key-1", alg: "RS256" }],
        });
      if (url === "https://oauth2.googleapis.com/token") {
        oauthCalls++;
        const form = new URLSearchParams(String(init?.body));
        expect(form.get("grant_type")).toBe(
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        );
        return Response.json({
          access_token: "google-access",
          expires_in: 3600,
        });
      }
      if (url === FCM) {
        const body = JSON.parse(String(init?.body));
        pushes.push({
          auth: new Headers(init?.headers).get("Authorization"),
          body,
        });
        if (gone.has(body.message.token))
          return Response.json(
            {
              error: {
                status: "NOT_FOUND",
                details: [{ errorCode: "UNREGISTERED" }],
              },
            },
            { status: 404 },
          );
        return Response.json({ name: "projects/umbra-18ba8/messages/1" });
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch,
  };
  const send = async (path: string, body?: unknown, auth?: string) => {
    const headers = new Headers({ Origin: SITE });
    if (auth) headers.set("Authorization", `Bearer ${auth}`);
    const response = await handle(
      new Request(`https://umbra-api.example.workers.dev${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      deps,
    );
    await Promise.all(pending);
    return { status: response.status, data: await response.json() };
  };
  return { send, pushes, gone, accounts, oauth: () => oauthCalls };
}

describe("TVs of an account", () => {
  it("keep one entry per TV, newest first, at most five, forgotten when unseen", () => {
    let list = applyDevices([], { op: "register", device: tv("a") }, NOW);
    // The same TV with a new push token replaces itself.
    list = applyDevices(
      list,
      { op: "register", device: tv("a", { token: "new-token-0123456789-x" }) },
      NOW + 1,
    );
    expect(list).toHaveLength(1);
    expect(list[0].token).toBe("new-token-0123456789-x");

    for (let i = 0; i < MAX_DEVICES + 2; i++)
      list = applyDevices(
        list,
        { op: "register", device: tv(`t${i}`) },
        NOW + 10 + i,
      );
    expect(list).toHaveLength(MAX_DEVICES);
    expect(list[0].id).toBe(`t${MAX_DEVICES + 1}`);
    expect(list.some((d) => d.id === "a")).toBe(false);

    expect(
      applyDevices(list, { op: "remove", id: list[0].id }, NOW),
    ).toHaveLength(MAX_DEVICES - 1);
    expect(applyDevices(list, { op: "list" }, NOW + DEVICE_TTL + 100)).toEqual(
      [],
    );
  });
});

describe("«На телевизоре в Lampa»", () => {
  it("the TV registers, the phone sees it without tokens and opens a title on it", async () => {
    const api = setup();
    const owner = await idToken("owner");

    expect((await api.send("/tv/device", tv("sony"))).status).toBe(401);
    expect(
      (await api.send("/tv/device", { id: "x", token: "" }, owner)).status,
    ).toBe(400);
    expect((await api.send("/tv/device", tv("sony"), owner)).data).toEqual({
      devices: 1,
    });

    const list = await api.send("/tv/devices", undefined, owner);
    expect(list.data).toEqual({
      devices: [
        { id: "sony", device: "BRAVIA 4K VH21", lampa: true, background: true },
      ],
    });
    // Another account sees nothing of it.
    expect(
      (await api.send("/tv/devices", undefined, await idToken("stranger")))
        .data,
    ).toEqual({
      devices: [],
    });

    const open = await api.send("/tv/open", { type: "tv", id: 1399 }, owner);
    expect(open).toEqual({ status: 200, data: { sent: 1 } });
    expect(api.pushes).toEqual([
      {
        auth: "Bearer google-access",
        body: {
          message: {
            token: "token-of-sony-0123456789",
            data: { action: "lampa", type: "tv", id: "1399" },
            android: { priority: "HIGH", ttl: "60s" },
          },
        },
      },
    ]);
    // The Google access token is reused for the next command.
    await api.send("/tv/open", { type: "movie", id: 438631 }, owner);
    expect(api.oauth()).toBe(1);
    expect(api.pushes).toHaveLength(2);
  });

  it("accepts only a type and a number, and only TVs with Lampa", async () => {
    const api = setup();
    const owner = await idToken("owner");
    expect(
      (await api.send("/tv/open", { type: "movie", id: 1 }, owner)).data.error,
    ).toBe("no_tv");
    await api.send("/tv/device", tv("old", { lampa: false }), owner);
    expect(
      (await api.send("/tv/open", { type: "movie", id: 1 }, owner)).status,
    ).toBe(404);
    for (const body of [
      { type: "game", id: 1 },
      { type: "movie", id: "1" },
      { type: "movie", id: -5 },
    ])
      expect((await api.send("/tv/open", body, owner)).data.error).toBe(
        "bad_title",
      );
    expect(api.pushes).toHaveLength(0);
  });

  it("forgets a TV that no longer has the app", async () => {
    const api = setup();
    const owner = await idToken("owner");
    await api.send("/tv/device", tv("sony"), owner);
    await api.send("/tv/device", tv("bedroom"), owner);
    api.gone.add("token-of-sony-0123456789");
    expect(
      (await api.send("/tv/open", { type: "movie", id: 603 }, owner)).data,
    ).toEqual({
      sent: 1,
    });
    expect(api.accounts.get("owner")!.map((d) => d.id)).toEqual(["bedroom"]);
  });
});
