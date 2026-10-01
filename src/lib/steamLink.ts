import { readStorage, writeStorage } from "./storage";

/**
 * Steam sign-in uses OpenID 2.0: the browser goes to Steam and comes back to
 * the site root with openid.* parameters, which the API worker then confirms
 * with Steam. The app uses hash routes, so the answer arrives in the query
 * string and is parked here until the library page picks it up.
 */
const KEY = "umbra.steamReturn";

function home() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

export function steamLoginUrl() {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${home()}?steam=1`,
    "openid.realm": window.location.origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `https://steamcommunity.com/openid/login?${params}`;
}

/** Runs before the app renders: keeps Steam's answer and cleans the URL. */
export function captureSteamReturn() {
  if (typeof window === "undefined") return;
  const search = new URLSearchParams(window.location.search);
  if (!search.has("steam") || !search.has("openid.mode")) return;
  const params: Record<string, string> = {};
  search.forEach((v, k) => {
    if (k.startsWith("openid.")) params[k] = v;
  });
  writeStorage(KEY, JSON.stringify(params));
  window.history.replaceState(null, "", `${home()}#/games/library`);
}

export function takeSteamReturn(): Record<string, string> | null {
  const raw = readStorage(KEY);
  if (!raw) return null;
  writeStorage(KEY, null);
  try {
    const value = JSON.parse(raw) as Record<string, string>;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}
