import type { Deps } from "./env";
import { ApiError, cached } from "./http";

/**
 * Checks a Firebase ID token (the app's sign-in) so only people with an
 * account can spend the AI budget. Tokens are RS256 JWTs signed by Google;
 * the public keys are fetched once an hour.
 */
const KEYS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export type FirebaseUser = {
  uid: string;
  email: string | null;
};

type Jwk = JsonWebKey & { kid?: string };

const fromBase64Url = (part: string) => {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const decodeJson = (part: string) =>
  JSON.parse(new TextDecoder().decode(fromBase64Url(part))) as Record<
    string,
    unknown
  >;

async function signingKeys(deps: Deps): Promise<Jwk[]> {
  const { body } = await cached(deps, "firebase/jwks", 3600, async () => {
    const r = await deps.fetch(KEYS_URL);
    if (!r.ok) throw new ApiError(502, "auth_keys", "Cannot load sign-in keys");
    return r.text();
  });
  return ((JSON.parse(body) as { keys?: Jwk[] }).keys ?? []).filter(
    (k) => k.kty === "RSA",
  );
}

/** The signed-in user behind `Authorization: Bearer <id token>`. */
export async function verifyIdToken(
  deps: Deps,
  header: string | null,
  projectId: string,
): Promise<FirebaseUser> {
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new ApiError(401, "sign_in_required", "Sign in first");
  const parts = token.split(".");
  if (parts.length !== 3) throw new ApiError(401, "bad_token", "Bad token");
  let head: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    head = decodeJson(parts[0]);
    claims = decodeJson(parts[1]);
  } catch {
    throw new ApiError(401, "bad_token", "Bad token");
  }
  if (head.alg !== "RS256" || typeof head.kid !== "string")
    throw new ApiError(401, "bad_token", "Bad token");

  const jwk = (await signingKeys(deps)).find((k) => k.kid === head.kid);
  if (!jwk) throw new ApiError(401, "bad_token", "Unknown signing key");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    fromBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new ApiError(401, "bad_token", "Bad signature");

  const now = Math.floor(deps.now() / 1000);
  const skew = 300;
  if (
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.exp !== "number" ||
    claims.exp + skew < now ||
    (typeof claims.iat === "number" && claims.iat - skew > now)
  )
    throw new ApiError(401, "bad_token", "Expired or foreign token");
  return {
    uid: claims.sub,
    email:
      typeof claims.email === "string" && claims.email_verified === true
        ? claims.email.toLowerCase()
        : null,
  };
}
