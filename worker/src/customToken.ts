import { ApiError } from "./http";

/**
 * A Firebase custom token: a JWT signed with the project's service account,
 * exchanged by the TV for a normal sign-in (signInWithCustomToken).
 * https://firebase.google.com/docs/auth/admin/create-custom-tokens#create_custom_tokens_using_a_third-party_jwt_library
 */
const AUDIENCE =
  "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

export type ServiceAccount = { client_email: string; private_key: string };

export function parseServiceAccount(json: string | undefined): ServiceAccount {
  try {
    const account = JSON.parse(json || "") as Partial<ServiceAccount>;
    if (account.client_email && account.private_key?.includes("PRIVATE KEY"))
      return account as ServiceAccount;
  } catch {
    // fall through
  }
  throw new ApiError(503, "tv_not_configured", "No FIREBASE_SERVICE_ACCOUNT");
}

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const encodeJson = (value: unknown) =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)));

function pemToDer(pem: string) {
  const body = pem
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

const keys = new Map<string, Promise<CryptoKey>>();

function signingKey(pem: string) {
  let key = keys.get(pem);
  if (!key) {
    key = crypto.subtle.importKey(
      "pkcs8",
      pemToDer(pem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keys.set(pem, key);
  }
  return key;
}

/** An RS256 JWT signed with the service account's key. */
export async function signJwt(
  account: ServiceAccount,
  payload: Record<string, unknown>,
) {
  const head = encodeJson({ alg: "RS256", typ: "JWT" });
  const body = encodeJson(payload);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await signingKey(account.private_key),
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${base64Url(new Uint8Array(signature))}`;
}

/** A one-hour custom token for `uid`; `claims` end up in the ID token. */
export function customToken(
  account: ServiceAccount,
  uid: string,
  now: number,
  claims: Record<string, unknown> = {},
) {
  const iat = Math.floor(now / 1000);
  return signJwt(account, {
    iss: account.client_email,
    sub: account.client_email,
    aud: AUDIENCE,
    iat,
    exp: iat + 3600,
    uid,
    claims,
  });
}
