import type { Deps } from "./env";
import { ApiError } from "./http";

const API = "https://api.steampowered.com";
export const STEAM_ID = /^\d{17}$/;

function key(deps: Deps) {
  const value = deps.env.STEAM_API_KEY;
  if (!value)
    throw new ApiError(503, "steam_not_configured", "Steam key is missing");
  return value;
}

async function get<T>(deps: Deps, path: string, withKey = true): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API}${path}${withKey ? `${sep}key=${encodeURIComponent(key(deps))}` : ""}`;
  const response = await deps.fetch(url, {
    headers: { Accept: "application/json" },
  });
  // Steam answers 401/403 for private profiles and hidden stats.
  if (response.status === 401 || response.status === 403)
    throw new ApiError(403, "steam_private", "The Steam profile is private");
  if (!response.ok)
    throw new ApiError(
      502,
      "steam_unavailable",
      `Steam answered ${response.status}`,
    );
  return (await response.json()) as T;
}

export async function steamProfile(deps: Deps, steamId: string) {
  const data = await get<{
    response?: {
      players?: Array<{
        steamid?: string;
        personaname?: string;
        avatarfull?: string;
        profileurl?: string;
        communityvisibilitystate?: number;
      }>;
    };
  }>(deps, `/ISteamUser/GetPlayerSummaries/v2/?steamids=${steamId}`);
  const p = data.response?.players?.[0];
  if (!p) throw new ApiError(404, "steam_user_not_found", "No such Steam user");
  return {
    steamId,
    name: p.personaname || "",
    avatar: p.avatarfull || "",
    url: p.profileurl || `https://steamcommunity.com/profiles/${steamId}`,
    public: p.communityvisibilitystate === 3,
  };
}

export type OwnedGame = {
  appId: number;
  name: string;
  minutes: number;
  recent: number;
  lastPlayed: number;
};

/** Owned games with play time, and the wishlist; private parts come back empty. */
export async function steamLibrary(deps: Deps, steamId: string) {
  const [owned, wishlist] = await Promise.all([
    get<{
      response?: {
        game_count?: number;
        games?: Array<{
          appid?: number;
          name?: string;
          playtime_forever?: number;
          playtime_2weeks?: number;
          rtime_last_played?: number;
        }>;
      };
    }>(
      deps,
      `/IPlayerService/GetOwnedGames/v1/?steamid=${steamId}&include_appinfo=1&include_played_free_games=1`,
    ),
    get<{
      response?: { items?: Array<{ appid?: number; date_added?: number }> };
    }>(deps, `/IWishlistService/GetWishlist/v1/?steamid=${steamId}`).catch(
      () => ({ response: { items: [] } }),
    ),
  ]);
  const games = owned.response?.games;
  return {
    // GetOwnedGames returns an empty object when game details are hidden.
    private: !games,
    games: (games ?? [])
      .filter((g) => typeof g.appid === "number")
      .map((g): OwnedGame => ({
        appId: g.appid!,
        name: g.name || "",
        minutes: g.playtime_forever ?? 0,
        recent: g.playtime_2weeks ?? 0,
        lastPlayed: g.rtime_last_played ?? 0,
      })),
    wishlist: (wishlist.response?.items ?? [])
      .map((i) => i.appid)
      .filter((id): id is number => typeof id === "number"),
  };
}

/** The player's achievements in one game, with how rare each one is. */
export async function steamAchievements(
  deps: Deps,
  steamId: string,
  appId: number,
) {
  const [player, schema, global] = await Promise.all([
    get<{
      playerstats?: {
        success?: boolean;
        achievements?: Array<{
          apiname?: string;
          achieved?: number;
          unlocktime?: number;
        }>;
      };
    }>(
      deps,
      `/ISteamUserStats/GetPlayerAchievements/v1/?steamid=${steamId}&appid=${appId}`,
    ),
    get<{
      game?: {
        availableGameStats?: {
          achievements?: Array<{
            name?: string;
            displayName?: string;
            description?: string;
            icon?: string;
            hidden?: number;
          }>;
        };
      };
    }>(
      deps,
      `/ISteamUserStats/GetSchemaForGame/v2/?appid=${appId}&l=russian`,
    ).catch(() => ({ game: undefined })),
    get<{
      achievementpercentages?: {
        achievements?: Array<{ name?: string; percent?: number | string }>;
      };
    }>(
      deps,
      `/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`,
      false,
    ).catch(() => ({ achievementpercentages: { achievements: [] } })),
  ]);
  const mine = player.playerstats?.achievements ?? [];
  const info = new Map(
    (schema.game?.availableGameStats?.achievements ?? []).map((a) => [
      a.name || "",
      a,
    ]),
  );
  const percent = new Map(
    (global.achievementpercentages?.achievements ?? []).map((a) => [
      a.name || "",
      Number(a.percent),
    ]),
  );
  const rows = mine
    .filter((a) => a.apiname)
    .map((a) => {
      const meta = info.get(a.apiname!);
      const share = percent.get(a.apiname!);
      return {
        name: meta?.displayName || a.apiname!,
        description: meta?.hidden && !a.achieved ? "" : meta?.description || "",
        icon: meta?.icon || "",
        percent:
          typeof share === "number" && Number.isFinite(share)
            ? Math.round(share * 10) / 10
            : null,
        unlocked: a.achieved === 1,
        unlockedAt: a.unlocktime || 0,
      };
    });
  const byRarity = (
    a: { percent: number | null },
    b: { percent: number | null },
  ) => (a.percent ?? 100) - (b.percent ?? 100);
  return {
    total: rows.length,
    achieved: rows.filter((r) => r.unlocked).length,
    rarest: rows
      .filter((r) => r.unlocked)
      .sort(byRarity)
      .slice(0, 6),
    // Locked achievements most players have: the easiest next steps.
    next: rows
      .filter((r) => !r.unlocked)
      .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))
      .slice(0, 3),
  };
}
