import { beforeAll, describe, expect, it } from "vitest";
import { handle } from "../../worker/src/index";
import {
  CODE_RE,
  CODE_TTL,
  applyPairing,
  newCode,
  type Pairing,
  type PairingOp,
  type PairingStore,
} from "../../worker/src/tvLogin";
import { customToken } from "../../worker/src/customToken";
import type { CacheLike, Deps, Env } from "../../worker/src/env";

const SITE = "https://kovalenkoserhii2107-maker.github.io";
const PROJECT = "umbra-18ba8";
const NOW = Date.UTC(2026, 9, 24, 20);

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === "string" ? bytes : String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (part: string) => {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(
    atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)),
    (c) => c.charCodeAt(0),
  );
};
const claimsOf = (jwt: string) =>
  JSON.parse(new TextDecoder().decode(fromB64url(jwt.split(".")[1])));

let firebaseKeys: CryptoKeyPair;
let firebaseJwk: JsonWebKey;
let serviceKeys: CryptoKeyPair;
let serviceAccount: string;

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

beforeAll(async () => {
  firebaseKeys = await rsa();
  firebaseJwk = await crypto.subtle.exportKey("jwk", firebaseKeys.publicKey);
  serviceKeys = await rsa();
  const der = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", serviceKeys.privateKey),
  );
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))
    .match(/.{1,64}/g)!
    .join("\n")}\n-----END PRIVATE KEY-----\n`;
  serviceAccount = JSON.stringify({
    type: "service_account",
    project_id: PROJECT,
    client_email: "firebase-adminsdk@umbra-18ba8.iam.gserviceaccount.com",
    private_key: pem,
  });
});

/** A Firebase ID token of the phone's account. */
async function idToken(uid = "phone-user") {
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

/** The Durable Object's rules over a Map, with a clock the test moves. */
function memoryStore(clock: { now: number }): PairingStore {
  const codes = new Map<string, Pairing>();
  return (code) => ({
    async run(op: PairingOp) {
      const { record, result } = applyPairing(
        codes.get(code) ?? null,
        op,
        clock.now,
      );
      if (record) codes.set(code, record);
      else codes.delete(code);
      return result;
    },
  });
}

function setup(extra: Partial<Env> = {}) {
  const clock = { now: NOW };
  const pending: Promise<unknown>[] = [];
  const deps: Deps = {
    env: {
      ALLOWED_ORIGINS: SITE,
      FIREBASE_PROJECT_ID: PROJECT,
      FIREBASE_SERVICE_ACCOUNT: serviceAccount,
      ...extra,
    },
    pairing: memoryStore(clock),
    cache: memoryCache(),
    now: () => clock.now,
    waitUntil: (task) => pending.push(task),
    fetch: (async (input: RequestInfo | URL) => {
      if (String(input).includes("securetoken@system.gserviceaccount.com"))
        return Response.json({
          keys: [{ ...firebaseJwk, kid: "key-1", alg: "RS256" }],
        });
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch,
  };
  const send = async (
    path: string,
    body?: unknown,
    auth?: string,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const headers = new Headers({ Origin: SITE });
    if (auth) headers.set("Authorization", `Bearer ${auth}`);
    const response = await handle(
      new Request(`https://umbra-api.example.workers.dev${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      deps,
    );
    await Promise.all(pending);
    return { status: response.status, data: await response.json() };
  };
  return { send, clock };
}

describe("TV sign-in codes", () => {
  it("are eight letters and digits that cannot be confused", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(CODE_RE);
    expect(newCode(() => new Uint8Array(8))).toBe("AAAAAAAA");
    expect("ABCD1234").not.toMatch(CODE_RE);
  });

  it("go pending → approved → used, and only the TV with the secret gets the token", () => {
    const create = applyPairing(
      null,
      { op: "create", secretHash: "s", device: "BRAVIA" },
      NOW,
    );
    expect(create.result).toEqual({ ok: true, status: "pending" });
    let record = create.record;
    expect(
      applyPairing(record, { op: "create", secretHash: "x", device: "" }, NOW)
        .result,
    ).toEqual({ ok: false, error: "taken" });

    const wait = applyPairing(record, { op: "take", secretHash: "s" }, NOW);
    expect(wait.result).toEqual({ ok: true, status: "pending" });

    const yes = applyPairing(
      record,
      { op: "answer", approve: true, uid: "u1" },
      NOW,
    );
    expect(yes.result).toEqual({ ok: true, status: "approved" });
    record = yes.record;
    // A second answer cannot change it.
    expect(
      applyPairing(record, { op: "answer", approve: false, uid: "u2" }, NOW)
        .result,
    ).toEqual({ ok: false, error: "answered" });

    expect(
      applyPairing(record, { op: "take", secretHash: "wrong" }, NOW).result,
    ).toEqual({ ok: false, error: "not_found" });
    const take = applyPairing(record, { op: "take", secretHash: "s" }, NOW);
    expect(take.result).toEqual({ ok: true, status: "approved", uid: "u1" });
    expect(
      applyPairing(take.record, { op: "take", secretHash: "s" }, NOW).result,
    ).toEqual({ ok: false, error: "answered" });
  });

  it("end when refused or after ten minutes", () => {
    const { record } = applyPairing(
      null,
      { op: "create", secretHash: "s", device: "TV" },
      NOW,
    );
    const no = applyPairing(
      record,
      { op: "answer", approve: false, uid: "u1" },
      NOW,
    );
    expect(
      applyPairing(no.record, { op: "take", secretHash: "s" }, NOW).result,
    ).toEqual({ ok: true, status: "denied" });

    const late = applyPairing(
      record,
      { op: "answer", approve: true, uid: "u1" },
      NOW + CODE_TTL,
    );
    expect(late).toEqual({
      record: null,
      result: { ok: false, error: "expired" },
    });
  });
});

describe("custom token", () => {
  it("is signed by the service account for the Firebase sign-in API", async () => {
    const account = JSON.parse(serviceAccount);
    const jwt = await customToken(account, "u1", NOW, { tv: true });
    const [head, body, signature] = jwt.split(".");
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      serviceKeys.publicKey,
      fromB64url(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
    expect(valid).toBe(true);
    expect(claimsOf(jwt)).toEqual({
      iss: account.client_email,
      sub: account.client_email,
      aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
      uid: "u1",
      claims: { tv: true },
    });
  });
});

describe("TV sign-in API", () => {
  it("TV asks for a code, the phone approves, the TV gets a token once", async () => {
    const { send } = setup();
    const created = await send("/tv/code", { device: "BRAVIA 4K VH21" });
    expect(created.status).toBe(200);
    const { code, secret, expiresIn, interval } = created.data;
    expect(code).toMatch(CODE_RE);
    expect(secret.length).toBeGreaterThan(30);
    expect([expiresIn, interval]).toEqual([600, 3]);

    expect((await send("/tv/token", { code, secret })).data).toEqual({
      status: "pending",
    });

    // The phone needs an account to see or answer the code.
    expect((await send(`/tv/code/${code}`)).status).toBe(401);
    expect((await send("/tv/confirm", { code, approve: true })).status).toBe(
      401,
    );
    const phone = await idToken("phone-user");
    // Codes may be typed by hand: lower case and a dash are fine.
    const pretty = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    expect((await send(`/tv/code/${pretty}`, undefined, phone)).data).toEqual({
      status: "pending",
      device: "BRAVIA 4K VH21",
      expiresAt: NOW + 600_000,
    });
    expect(
      (await send("/tv/confirm", { code: pretty, approve: true }, phone)).data,
    ).toEqual({ status: "approved" });

    // Someone else with the code but without the secret gets nothing.
    expect(
      (await send("/tv/token", { code, secret: "x".repeat(43) })).data,
    ).toEqual({ status: "expired" });
    const done = await send("/tv/token", { code, secret });
    expect(done.data.status).toBe("approved");
    expect(claimsOf(done.data.token)).toMatchObject({
      uid: "phone-user",
      claims: { tv: true },
    });
    expect((await send("/tv/token", { code, secret })).data).toEqual({
      status: "used",
    });
  });

  it("a refused code tells the TV so; a late answer finds it expired", async () => {
    const { send, clock } = setup();
    const phone = await idToken();
    const first = (await send("/tv/code", {})).data;
    expect(
      (await send("/tv/confirm", { code: first.code, approve: false }, phone))
        .data,
    ).toEqual({ status: "denied" });
    expect(
      (await send("/tv/token", { code: first.code, secret: first.secret }))
        .data,
    ).toEqual({ status: "denied" });

    const second = (await send("/tv/code", {})).data;
    clock.now += CODE_TTL;
    const late = await send(
      "/tv/confirm",
      { code: second.code, approve: true },
      phone,
    );
    expect(late.status).toBe(404);
    expect(late.data.error).toBe("tv_code_expired");
    expect(
      (await send("/tv/token", { code: second.code, secret: second.secret }))
        .data,
    ).toEqual({ status: "expired" });
  });

  it("rejects bad codes and works only when set up", async () => {
    const { send } = setup();
    const phone = await idToken();
    expect(
      (await send("/tv/confirm", { code: "0000", approve: true }, phone))
        .status,
    ).toBe(400);
    expect(
      (await send("/tv/confirm", { code: "AAAAAAAA", approve: "yes" }, phone))
        .status,
    ).toBe(400);

    // Without the signing key no code is given out at all.
    const bare = setup({ FIREBASE_SERVICE_ACCOUNT: undefined });
    const tv = await bare.send("/tv/code", {});
    expect(tv.status).toBe(503);
    expect(tv.data.error).toBe("tv_not_configured");
    const broken = setup({ FIREBASE_SERVICE_ACCOUNT: "{}" });
    expect((await broken.send("/tv/code", {})).status).toBe(503);
  });

  it("accepts the Auth emulator's unsigned tokens only when told to", async () => {
    const unsigned = `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(
      JSON.stringify({
        aud: PROJECT,
        iss: `https://securetoken.google.com/${PROJECT}`,
        sub: "emulated",
        iat: NOW / 1000,
        exp: NOW / 1000 + 3600,
      }),
    )}.`;
    const prod = setup();
    const code = (await prod.send("/tv/code", {})).data.code;
    expect(
      (await prod.send("/tv/confirm", { code, approve: true }, unsigned))
        .status,
    ).toBe(401);

    const local = setup({
      AUTH_EMULATOR: "true",
      FIREBASE_SERVICE_ACCOUNT: undefined,
    });
    const tv = (await local.send("/tv/code", {})).data;
    expect(
      (
        await local.send(
          "/tv/confirm",
          { code: tv.code, approve: true },
          unsigned,
        )
      ).data,
    ).toEqual({ status: "approved" });
    const token = (await local.send("/tv/token", tv)).data.token;
    expect(token.endsWith(".")).toBe(true);
    expect(claimsOf(token).uid).toBe("emulated");
  });
});
