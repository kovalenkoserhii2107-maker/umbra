import type { Deps } from "./env";
import { ApiError } from "./http";

const OPENID = "https://steamcommunity.com/openid/login";
const CLAIMED = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/**
 * Confirms a Steam sign-in. Steam sends the browser back to the app with
 * openid.* parameters; the app forwards them here and we ask Steam whether
 * they are genuine (check_authentication) before trusting the SteamID.
 */
export async function verifySteamLogin(
  deps: Deps,
  params: Record<string, unknown>,
  allowedOrigins: string[],
) {
  const p: Record<string, string> = {};
  for (const [key, value] of Object.entries(params))
    if (key.startsWith("openid.") && typeof value === "string") p[key] = value;

  if (p["openid.mode"] !== "id_res")
    throw new ApiError(
      400,
      "steam_cancelled",
      "Steam sign-in was not completed",
    );
  if (p["openid.op_endpoint"] !== OPENID)
    throw new ApiError(400, "steam_invalid", "Unexpected OpenID provider");
  const match = (p["openid.claimed_id"] || "").match(CLAIMED);
  if (!match || p["openid.identity"] !== p["openid.claimed_id"])
    throw new ApiError(400, "steam_invalid", "No Steam account in the answer");
  let returnOrigin = "";
  try {
    returnOrigin = new URL(p["openid.return_to"] || "").origin;
  } catch {
    /* handled below */
  }
  if (!allowedOrigins.includes(returnOrigin))
    throw new ApiError(400, "steam_invalid", "Sign-in started on another site");

  const body = new URLSearchParams({
    ...p,
    "openid.mode": "check_authentication",
  });
  const response = await deps.fetch(OPENID, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok)
    throw new ApiError(
      502,
      "steam_unavailable",
      `Steam answered ${response.status}`,
    );
  const text = await response.text();
  if (!/^is_valid\s*:\s*true\s*$/m.test(text))
    throw new ApiError(
      401,
      "steam_rejected",
      "Steam did not confirm the sign-in",
    );
  return { steamId: match[1] };
}
