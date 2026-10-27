import type { Deps } from "./env";
import { ApiError, bump, cached } from "./http";
import { parseServiceAccount, signJwt } from "./customToken";

/**
 * «На телевізорі в Lampa»: the phone asks, the TV of the same account opens
 * the title in Lampa. TVs register themselves with their push token (FCM);
 * the worker keeps them per account in a Durable Object (TvRemote) and sends
 * the command as a push the TV app receives even while closed.
 *
 * A command carries only the title's type and number: nothing else can be
 * sent to a TV this way.
 */

export type Device = {
  /** ANDROID_ID: stays the same across app restarts and token changes. */
  id: string;
  token: string;
  /** "BRAVIA 4K VH21" — shown on the phone. */
  device: string;
  lampa: boolean;
  /** Allowed to open Lampa from the background (display over other apps). */
  background: boolean;
  updatedAt: number;
};

export type DeviceOp =
  | { op: "register"; device: Omit<Device, "updatedAt"> }
  | { op: "list" }
  | { op: "remove"; id: string };

/** TVs an account keeps; the longest unseen go first. */
export const MAX_DEVICES = 5;
/** A TV not seen for this long is forgotten. */
export const DEVICE_TTL = 120 * 24 * 3600_000;

/** One step over an account's TVs; pure, so the Durable Object and the tests share it. */
export function applyDevices(
  current: Device[],
  op: DeviceOp,
  now: number,
): Device[] {
  const live = current.filter((d) => d.updatedAt + DEVICE_TTL > now);
  if (op.op === "list") return live;
  if (op.op === "remove") return live.filter((d) => d.id !== op.id);
  const others = live.filter(
    (d) => d.id !== op.device.id && d.token !== op.device.token,
  );
  return [{ ...op.device, updatedAt: now }, ...others]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_DEVICES);
}

/** Where TVs are kept: the TvRemote Durable Object, or memory in tests. */
export type DeviceStore = (uid: string) => {
  run(op: DeviceOp): Promise<Device[]>;
};

function store(deps: Deps) {
  if (!deps.devices)
    throw new ApiError(503, "tv_not_configured", "TV remote is not set up");
  return deps.devices;
}

const text = (value: unknown, max: number) =>
  // eslint-disable-next-line no-control-regex
  (typeof value === "string" ? value : "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim()
    .slice(0, max);

/** POST /tv/device — the TV (signed in) says where to reach it. */
export async function registerDevice(deps: Deps, uid: string, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = text(b.id, 64);
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id) || !/^[\w:.-]{20,4096}$/.test(token))
    throw new ApiError(400, "bad_device", "id and token are required");
  const devices = await store(deps)(uid).run({
    op: "register",
    device: {
      id,
      token,
      device: text(b.device, 60) || "Телевізор",
      lampa: b.lampa === true,
      background: b.background === true,
    },
  });
  return { devices: devices.length };
}

/** POST /tv/device/remove — a TV signing out removes itself from this account. */
export async function unregisterDevice(deps: Deps, uid: string, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = text(b.id, 64);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id))
    throw new ApiError(400, "bad_device", "id is required");
  const devices = await store(deps)(uid).run({ op: "remove", id });
  return { devices: devices.length };
}

/** What the phone sees of a TV: no push tokens. */
const visible = (d: Device) => ({
  id: d.id,
  device: d.device,
  lampa: d.lampa,
  background: d.background,
});

/** GET /tv/devices — the account's TVs, for the phone's button. */
export async function listDevices(deps: Deps, uid: string) {
  const devices = await store(deps)(uid).run({ op: "list" });
  return { devices: devices.map(visible) };
}

// ---- Google: an access token of the service account, FCM ----

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

async function accessToken(deps: Deps) {
  const account = parseServiceAccount(deps.env.FIREBASE_SERVICE_ACCOUNT);
  const { body } = await cached(deps, "google/fcm-token", 3000, async () => {
    const iat = Math.floor(deps.now() / 1000);
    const assertion = await signJwt(account, {
      iss: account.client_email,
      scope: FCM_SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    });
    const r = await deps.fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    const data = (await r.json().catch(() => null)) as {
      access_token?: string;
    } | null;
    if (!r.ok || !data?.access_token)
      throw new ApiError(502, "push_auth", "Cannot sign in to Google push");
    return data.access_token;
  });
  return body;
}

/** "sent", or "gone" when the TV dropped this token (the app was removed). */
async function push(
  deps: Deps,
  token: string,
  data: Record<string, string>,
): Promise<"sent" | "gone"> {
  const project = deps.env.FIREBASE_PROJECT_ID || "umbra-18ba8";
  const r = await deps.fetch(
    `https://fcm.googleapis.com/v1/projects/${project}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken(deps)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          data,
          // At once, and not later: a film opened an hour after asking is a surprise.
          android: { priority: "HIGH", ttl: "60s" },
        },
      }),
    },
  );
  if (r.ok) return "sent";
  const answer = await r.text();
  if (r.status === 404 || answer.includes("UNREGISTERED")) return "gone";
  throw new ApiError(502, "push_failed", `Push failed: ${r.status}`);
}

/** POST /tv/open — the phone asks the account's TVs to open a title in Lampa. */
export async function openOnTv(deps: Deps, uid: string, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const type = b.type === "movie" || b.type === "tv" ? b.type : null;
  const id = typeof b.id === "number" && Number.isInteger(b.id) ? b.id : 0;
  if (!type || id <= 0 || id > 9_999_999_999)
    throw new ApiError(400, "bad_title", "type and id are required");

  const devices = (await store(deps)(uid).run({ op: "list" })).filter(
    (d) => d.lampa && (typeof b.device !== "string" || d.id === b.device),
  );
  if (!devices.length)
    throw new ApiError(404, "no_tv", "No TV with Lampa on this account");

  const day = new Date(deps.now()).toISOString().slice(0, 10);
  if (!(await bump(deps, `tv/open/${day}/${uid}`, 200)))
    throw new ApiError(429, "tv_limit", "Too many today");

  const data = { action: "lampa", type, id: String(id) };
  let sent = 0;
  let lastError: unknown = null;
  for (const d of devices) {
    try {
      if ((await push(deps, d.token, data)) === "sent") sent++;
      else await store(deps)(uid).run({ op: "remove", id: d.id });
    } catch (err) {
      lastError = err;
    }
  }
  if (!sent) {
    if (lastError) throw lastError;
    throw new ApiError(404, "no_tv", "The TV is not reachable");
  }
  return { sent };
}

// ---- Durable Object ----

type DurableState = {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
  };
};

/** One account's TVs. Requests to it are handled one at a time by Cloudflare. */
export class TvRemote {
  private state: DurableState;
  constructor(state: DurableState) {
    this.state = state;
  }

  async fetch(request: Request) {
    const op = (await request.json()) as DeviceOp;
    const current = (await this.state.storage.get<Device[]>("devices")) ?? [];
    const next = applyDevices(current, op, Date.now());
    if (op.op !== "list" || next.length !== current.length)
      await this.state.storage.put("devices", next);
    return Response.json(next);
  }
}

type Namespace = {
  idFromName(name: string): unknown;
  get(id: unknown): {
    fetch(url: string, init: RequestInit): Promise<Response>;
  };
};

export function durableDevices(namespace: Namespace): DeviceStore {
  return (uid) => ({
    async run(op) {
      const stub = namespace.get(namespace.idFromName(uid));
      const response = await stub.fetch("https://tv-remote/run", {
        method: "POST",
        body: JSON.stringify(op),
      });
      return (await response.json()) as Device[];
    },
  });
}
