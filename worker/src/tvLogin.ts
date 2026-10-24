import type { Deps } from "./env";
import { ApiError, bump, sha256 } from "./http";

/**
 * Signing in on a TV with the phone: the TV asks for a code and shows it as a
 * QR; the phone, already signed in, approves or refuses it; the TV then
 * collects a one-time Firebase custom token for that account.
 *
 * Each code is one Durable Object (TvPairing), so its state changes one at a
 * time: a code is answered once and its token handed out once.
 */

/** Codes live this long; the TV asks for a new one after that. */
export const CODE_TTL = 10 * 60_000;
/** How often the TV may ask whether the phone has answered. */
export const POLL_INTERVAL = 3;

// No 0/O, 1/I/L: the code may be typed on the phone by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[A-HJKMNP-Z2-9]{8}$/;

export type PairingStatus = "pending" | "approved" | "denied" | "used";

export type Pairing = {
  status: PairingStatus;
  /** sha256 of the secret only the TV knows, needed to collect the token. */
  secretHash: string;
  /** "BRAVIA 4K VH21" — shown on the phone so you know which TV asks. */
  device: string;
  expiresAt: number;
  uid?: string;
};

export type PairingOp =
  | { op: "create"; secretHash: string; device: string }
  | { op: "peek" }
  | { op: "answer"; approve: boolean; uid: string }
  | { op: "take"; secretHash: string };

export type PairingResult =
  | {
      ok: true;
      status: PairingStatus;
      device?: string;
      expiresAt?: number;
      uid?: string;
    }
  | { ok: false; error: "taken" | "not_found" | "expired" | "answered" };

/**
 * One step of a code's life. Pure, so the Durable Object and the tests run
 * the same rules: `record` is what to keep (null — forget the code).
 */
export function applyPairing(
  current: Pairing | null,
  op: PairingOp,
  now: number,
): { record: Pairing | null; result: PairingResult } {
  const live = current && current.expiresAt > now ? current : null;
  if (op.op === "create") {
    if (live) return { record: live, result: { ok: false, error: "taken" } };
    const record: Pairing = {
      status: "pending",
      secretHash: op.secretHash,
      device: op.device,
      expiresAt: now + CODE_TTL,
    };
    return { record, result: { ok: true, status: "pending" } };
  }
  if (!live)
    return {
      record: null,
      result: { ok: false, error: current ? "expired" : "not_found" },
    };
  if (op.op === "peek")
    return {
      record: live,
      result: {
        ok: true,
        status: live.status,
        device: live.device,
        expiresAt: live.expiresAt,
      },
    };
  if (op.op === "answer") {
    if (live.status !== "pending")
      return { record: live, result: { ok: false, error: "answered" } };
    const record: Pairing = op.approve
      ? { ...live, status: "approved", uid: op.uid }
      : { ...live, status: "denied" };
    return { record, result: { ok: true, status: record.status } };
  }
  // take: only the TV that asked for the code, and only once.
  if (op.secretHash !== live.secretHash)
    return { record: live, result: { ok: false, error: "not_found" } };
  if (live.status === "approved")
    return {
      record: { ...live, status: "used" },
      result: { ok: true, status: "approved", uid: live.uid },
    };
  if (live.status === "used")
    return { record: live, result: { ok: false, error: "answered" } };
  return { record: live, result: { ok: true, status: live.status } };
}

/** Where codes are kept: the TvPairing Durable Object, or memory in tests. */
export type PairingStore = (code: string) => {
  run(op: PairingOp): Promise<PairingResult>;
};

export function newCode(random = crypto.getRandomValues.bind(crypto)) {
  const bytes = random(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function newSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function store(deps: Deps) {
  if (!deps.pairing)
    throw new ApiError(503, "tv_not_configured", "TV sign-in is not set up");
  return deps.pairing;
}

function cleanDevice(value: unknown) {
  const text = typeof value === "string" ? value : "";
  // eslint-disable-next-line no-control-regex
  return (
    text
      .replace(/[\u0000-\u001f<>]/g, "")
      .trim()
      .slice(0, 60) || "Телевизор"
  );
}

/** POST /tv/code — the TV asks for a code. */
export async function createCode(deps: Deps, body: unknown, ip: string) {
  const day = new Date(deps.now()).toISOString().slice(0, 10);
  // A TV asks for a new code every 10 minutes while the screen is open.
  if (!(await bump(deps, `tv/codes/${day}/${ip}`, 300)))
    throw new ApiError(429, "tv_limit", "Too many codes today");
  const device = cleanDevice((body as { device?: unknown } | null)?.device);
  const secret = newSecret();
  const secretHash = await sha256(secret);
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const result = await store(deps)(code).run({
      op: "create",
      secretHash,
      device,
    });
    if (result.ok)
      return {
        code,
        secret,
        expiresIn: CODE_TTL / 1000,
        interval: POLL_INTERVAL,
      };
  }
  throw new ApiError(503, "tv_busy", "Try again");
}

function codeOf(value: unknown) {
  const code =
    typeof value === "string" ? value.toUpperCase().replace(/[\s-]/g, "") : "";
  if (!CODE_RE.test(code))
    throw new ApiError(400, "bad_code", "Check the code on the TV");
  return code;
}

function failure(result: PairingResult & { ok: false }): never {
  if (result.error === "answered")
    throw new ApiError(409, "tv_answered", "This code is already answered");
  throw new ApiError(404, "tv_code_expired", "The code is no longer valid");
}

/** GET /tv/code/:code — the phone shows which TV asks (signed in only). */
export async function describeCode(deps: Deps, value: unknown) {
  const result = await store(deps)(codeOf(value)).run({ op: "peek" });
  if (!result.ok) failure(result);
  return {
    status: result.status,
    device: result.device,
    expiresAt: result.expiresAt,
  };
}

/** POST /tv/confirm — the phone approves or refuses. */
export async function answerCode(deps: Deps, body: unknown, uid: string) {
  const { code, approve } = (body ?? {}) as {
    code?: unknown;
    approve?: unknown;
  };
  if (typeof approve !== "boolean")
    throw new ApiError(400, "bad_request", "approve must be true or false");
  const result = await store(deps)(codeOf(code)).run({
    op: "answer",
    approve,
    uid,
  });
  if (!result.ok) failure(result);
  return { status: result.status };
}

/** POST /tv/token — the TV asks whether the phone has answered. */
export async function takeToken(
  deps: Deps,
  body: unknown,
  mint: (uid: string) => Promise<string>,
) {
  const { code, secret } = (body ?? {}) as { code?: unknown; secret?: unknown };
  if (typeof secret !== "string" || secret.length < 20)
    throw new ApiError(400, "bad_request", "secret is required");
  const result = await store(deps)(codeOf(code)).run({
    op: "take",
    secretHash: await sha256(secret),
  });
  if (!result.ok) {
    if (result.error === "answered") return { status: "used" };
    return { status: "expired" };
  }
  if (result.status === "approved" && result.uid)
    return { status: "approved", token: await mint(result.uid) };
  return { status: result.status };
}

// ---- Durable Object ----

type DurableState = {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    deleteAll(): Promise<void>;
    setAlarm(time: number): Promise<void>;
  };
};

/** One code. Requests to it are handled one at a time by Cloudflare. */
export class TvPairing {
  private state: DurableState;
  constructor(state: DurableState) {
    this.state = state;
  }

  async fetch(request: Request) {
    const op = (await request.json()) as PairingOp;
    const current = (await this.state.storage.get<Pairing>("pairing")) ?? null;
    const { record, result } = applyPairing(current, op, Date.now());
    if (record) {
      await this.state.storage.put("pairing", record);
      // Forget the code once it expires.
      if (!current)
        await this.state.storage.setAlarm(record.expiresAt + 60_000);
    } else if (current) await this.state.storage.deleteAll();
    return Response.json(result);
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}

type Namespace = {
  idFromName(name: string): unknown;
  get(id: unknown): {
    fetch(url: string, init: RequestInit): Promise<Response>;
  };
};

export function durableStore(namespace: Namespace): PairingStore {
  return (code) => ({
    async run(op) {
      const stub = namespace.get(namespace.idFromName(code));
      const response = await stub.fetch("https://tv-pairing/run", {
        method: "POST",
        body: JSON.stringify(op),
      });
      return (await response.json()) as PairingResult;
    },
  });
}
