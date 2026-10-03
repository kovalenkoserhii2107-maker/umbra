import type { AiPicks, AiStep } from "./api";
import type { LibraryItem } from "./library";
import { metaKey, type MetaMap } from "./meta";
import type { Platform } from "./providers";
import { genreTaste, keyOf, type Pick } from "./tonight";
import { tmdb, type TmdbItem } from "./tmdb";

/**
 * The library as Claude reads it: ratings, the watchlist, what was dropped
 * and what was simply watched, newest first, so it can tell taste from
 * habits and never suggests a title already seen.
 */
export const QUESTIONS_PER_ROUND = 4;

/** The whole library goes in; this only guards against a runaway size. */
const MAX = 300_000;

function line(x: LibraryItem, meta: MetaMap, withRating: boolean) {
  const m = meta[metaKey(x)];
  const facts = [
    x.year,
    x.type === "tv" ? "сериал" : "фильм",
    m?.genres.slice(0, 3).join("/"),
  ].filter(Boolean);
  const note = x.note.replace(/\s+/g, " ").trim().slice(0, 100);
  return `- ${x.title} (${facts.join(", ")})${withRating && x.rating !== null ? ` — ${x.rating}/10` : ""}${note ? ` · заметка: «${note}»` : ""}`;
}

export function buildProfile(
  items: LibraryItem[],
  meta: MetaMap,
  region: string,
  services: Platform[],
) {
  const recent = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
  // Favourites first, so the taste is plain to see.
  const rated = recent
    .filter((x) => x.rating !== null && x.status !== "dropped")
    .sort((a, b) => b.rating! - a.rating!);
  const by = (status: LibraryItem["status"]) =>
    recent.filter((x) => x.status === status);
  const plain = recent.filter(
    (x) => x.status === "watched" && x.rating === null,
  );

  const taste = [...genreTaste(items, meta).entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([g, t]) => `${g} ${t > 0 ? "+" : ""}${t.toFixed(1)}`);

  const parts = [
    `Страна: ${region}. Подписки: ${services.map((s) => s.name).join(", ") || "не указаны"}.`,
    `В библиотеке ${items.length} тайтлов: оценено ${rated.length}, смотрю ${by("watching").length}, хочу посмотреть ${by("watchlist").length}, бросил ${by("dropped").length}.`,
    taste.length
      ? `Отношение к жанрам по оценкам (от -1 до +1): ${taste.join(", ")}.`
      : "",
    rated.length
      ? `Все мои оценки (из 10), от лучших:\n${rated
          .map((x) => line(x, meta, true))
          .join("\n")}`
      : "Оценок пока нет.",
    by("watching").length
      ? `Смотрю сейчас:\n${by("watching")
          .map((x) => line(x, meta, false))
          .join("\n")}`
      : "",
    by("watchlist").length
      ? `Хочу посмотреть:\n${by("watchlist")
          .map((x) => line(x, meta, false))
          .join("\n")}`
      : "",
    by("dropped").length
      ? `Бросил (не понравилось):\n${by("dropped")
          .map((x) => line(x, meta, true))
          .join("\n")}`
      : "",
    // Titles only: enough not to suggest them again.
    plain.length
      ? `Посмотрено без оценки (всё, что видел): ${plain.map((x) => `${x.title} (${x.year})`).join("; ")}.`
      : "",
  ].filter(Boolean);
  const text = parts.join("\n\n");
  return text.length > MAX ? `${text.slice(0, MAX)}…` : text;
}

/** Questions answered since the last picks were shown. */
export function roundAnswers(steps: AiStep[]) {
  let n = 0;
  for (const s of steps) n = "shown" in s ? 0 : n + 1;
  return n;
}

/** Rounds started so far, counting the current one. */
export const roundOf = (steps: AiStep[]) =>
  1 + steps.filter((s) => "shown" in s).length;

const yearNum = (item: TmdbItem) =>
  Number((item.release_date || item.first_air_date || "").slice(0, 4)) || 0;

/** The TMDB entry Claude meant: by original title and year, then looser. */
export async function findPick(
  p: AiPicks["picks"][number],
): Promise<TmdbItem | null> {
  const queries = [
    ...new Set(
      [p.original_title, p.title].map((q) => q.trim()).filter(Boolean),
    ),
  ];
  for (const withYear of [true, false])
    for (const q of queries) {
      const page = await tmdb
        .findTitle(p.type, q, withYear ? p.year : undefined)
        .catch(() => null);
      const results = page?.results ?? [];
      const hit =
        results.find((x) => !p.year || Math.abs(yearNum(x) - p.year) <= 1) ||
        (withYear ? results[0] : undefined);
      if (hit) return hit;
    }
  return null;
}

/** Claude's picks as cards: found on TMDB, unseen, not shown before. */
export async function resolvePicks(
  picks: AiPicks["picks"],
  skip: Set<string>,
  limit = 6,
): Promise<Pick[]> {
  const found = await Promise.all(
    picks.map(async (p) => ({ p, item: await findPick(p) })),
  );
  const out: Pick[] = [];
  const taken = new Set(skip);
  for (const { p, item } of found) {
    if (!item) continue;
    const key = keyOf(p.type, item.id);
    if (taken.has(key)) continue;
    taken.add(key);
    out.push({
      key,
      type: p.type,
      item: { ...item, media_type: p.type },
      score: picks.length - out.length,
      reasons: p.reason ? [p.reason] : [],
    });
    if (out.length >= limit) break;
  }
  return out;
}
