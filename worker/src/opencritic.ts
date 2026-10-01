import type { Deps } from "./env";
import { ApiError } from "./http";

const HOST = "opencritic-api.p.rapidapi.com";

/** Compact answer for the app; OpenCritic's own objects are much larger. */
export type OpenCriticResult =
  | { found: false }
  | {
      found: true;
      id: number;
      name: string;
      url: string;
      score: number | null;
      tier: string | null;
      recommended: number | null;
      reviews: number;
      topReviews: Array<{
        outlet: string;
        author: string;
        score: number | null;
        verdict: string | null;
        snippet: string;
        url: string;
        date: string;
      }>;
    };

type SearchHit = { id?: number; name?: string; dist?: number };
type Game = {
  id?: number;
  name?: string;
  url?: string;
  topCriticScore?: number;
  tier?: string;
  percentRecommended?: number;
  numReviews?: number;
  firstReleaseDate?: string;
};
type Review = {
  score?: number;
  npScore?: number;
  snippet?: string;
  externalUrl?: string;
  publishedDate?: string;
  Outlet?: { name?: string };
  Authors?: Array<{ name?: string }>;
  ScoreFormat?: {
    isSelect?: boolean;
    options?: Array<{ label?: string; val?: number }>;
  };
};

function key(deps: Deps) {
  const value = deps.env.OPENCRITIC_API_KEY;
  if (!value)
    throw new ApiError(
      503,
      "opencritic_not_configured",
      "OpenCritic key is missing",
    );
  return value;
}

async function get<T>(deps: Deps, path: string): Promise<T> {
  const response = await deps.fetch(`https://${HOST}${path}`, {
    headers: { "X-RapidAPI-Key": key(deps), "X-RapidAPI-Host": HOST },
  });
  if (response.status === 404) return null as T;
  if (response.status === 429)
    throw new ApiError(429, "opencritic_limit", "OpenCritic daily limit");
  if (!response.ok)
    throw new ApiError(
      502,
      "opencritic_failed",
      `OpenCritic answered ${response.status}`,
    );
  return (await response.json()) as T;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;

function compactReview(r: Review) {
  const verdict =
    r.ScoreFormat?.isSelect && r.ScoreFormat.options
      ? r.ScoreFormat.options.find((o) => o.val === r.score)?.label || null
      : null;
  const score = number(r.npScore ?? r.score);
  return {
    outlet: r.Outlet?.name || "",
    author: (r.Authors ?? [])
      .map((a) => a.name)
      .filter(Boolean)
      .join(", "),
    score: score !== null && score <= 100 ? score : null,
    verdict,
    snippet: (r.snippet || "").trim(),
    url: r.externalUrl || "",
    date: (r.publishedDate || "").slice(0, 10),
  };
}

/**
 * Finds a game on OpenCritic by name. When the year is known, a candidate
 * released more than a year apart is skipped, so a remake does not lend its
 * score to the original.
 */
export async function openCritic(
  deps: Deps,
  name: string,
  year: number | null,
): Promise<OpenCriticResult> {
  const hits =
    (await get<SearchHit[] | null>(
      deps,
      `/game/search?criteria=${encodeURIComponent(name)}`,
    )) ?? [];
  const candidates = hits
    .filter((h) => typeof h.id === "number" && (h.dist ?? 1) <= 0.25)
    .sort((a, b) => (a.dist ?? 1) - (b.dist ?? 1))
    .slice(0, 2);
  for (const hit of candidates) {
    const game = await get<Game | null>(deps, `/game/${hit.id}`);
    if (!game?.id) continue;
    const released = Number((game.firstReleaseDate || "").slice(0, 4));
    if (year && released && Math.abs(released - year) > 1) continue;
    const reviews =
      (await get<Review[] | null>(
        deps,
        `/reviews/game/${game.id}?sort=popularity`,
      )) ?? [];
    const gameName = game.name || hit.name || name;
    return {
      found: true,
      id: game.id,
      name: gameName,
      url:
        typeof game.url === "string" && game.url.startsWith("https://")
          ? game.url
          : `https://opencritic.com/game/${game.id}/${slug(gameName)}`,
      score: number(game.topCriticScore),
      tier: game.tier || null,
      recommended: number(game.percentRecommended),
      reviews: number(game.numReviews) ?? 0,
      topReviews: reviews
        .map(compactReview)
        .filter((r) => r.outlet && r.snippet)
        .slice(0, 8),
    };
  }
  return { found: false };
}
