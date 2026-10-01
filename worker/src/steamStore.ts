import type { Deps } from "./env";
import { ApiError } from "./http";

/** What the app shows from the Steam store page of a game. */
export type SteamApp = {
  appId: number;
  name: string;
  about: string;
  short: string;
  headerImage: string;
  metacritic: { score: number; url: string } | null;
  recommendations: number | null;
  achievements: number | null;
  categories: string[];
  requirements: { minimum: string; recommended: string };
  reviews: {
    score: number;
    positive: number;
    total: number;
  } | null;
  players: number | null;
};

type AppDetails = Record<
  string,
  {
    success?: boolean;
    data?: {
      name?: string;
      about_the_game?: string;
      short_description?: string;
      header_image?: string;
      metacritic?: { score?: number; url?: string };
      recommendations?: { total?: number };
      achievements?: { total?: number };
      categories?: Array<{ description?: string }>;
      pc_requirements?: { minimum?: string; recommended?: string } | [];
    };
  }
>;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

/** Steam descriptions are HTML; the app shows plain text with line breaks. */
export function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h\d|li|ul|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|[a-z]+);/gi, (match, code: string) =>
      code.startsWith("#")
        ? String.fromCodePoint(Number(code.slice(1)))
        : (ENTITIES[code.toLowerCase()] ?? match),
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

async function getJson<T>(deps: Deps, url: string): Promise<T | null> {
  try {
    const response = await deps.fetch(url, {
      headers: { Accept: "application/json" },
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Store page, review summary and current players of one Steam app. */
export async function steamApp(deps: Deps, appId: number): Promise<SteamApp> {
  const [details, reviews, players] = await Promise.all([
    getJson<AppDetails>(
      deps,
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=russian&cc=us`,
    ),
    getJson<{
      query_summary?: {
        review_score?: number;
        total_positive?: number;
        total_reviews?: number;
      };
    }>(
      deps,
      `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`,
    ),
    getJson<{ response?: { player_count?: number; result?: number } }>(
      deps,
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
    ),
  ]);
  const entry = details?.[String(appId)];
  if (!entry?.success || !entry.data)
    throw new ApiError(404, "steam_app_not_found", "No such Steam app");
  const d = entry.data;
  const req = Array.isArray(d.pc_requirements) ? {} : d.pc_requirements || {};
  const summary = reviews?.query_summary;
  return {
    appId,
    name: d.name || "",
    about: htmlToText(d.about_the_game || "").slice(0, 6000),
    short: htmlToText(d.short_description || ""),
    headerImage: d.header_image || "",
    metacritic:
      d.metacritic?.score && d.metacritic.url
        ? { score: d.metacritic.score, url: d.metacritic.url }
        : null,
    recommendations: count(d.recommendations?.total),
    achievements: count(d.achievements?.total),
    categories: (d.categories ?? [])
      .map((c) => c.description || "")
      .filter(Boolean),
    requirements: {
      minimum: htmlToText(req.minimum || ""),
      recommended: htmlToText(req.recommended || ""),
    },
    reviews:
      summary?.total_reviews && summary.review_score
        ? {
            score: summary.review_score,
            positive: summary.total_positive ?? 0,
            total: summary.total_reviews,
          }
        : null,
    players:
      players?.response?.result === 1
        ? count(players.response.player_count)
        : null,
  };
}
