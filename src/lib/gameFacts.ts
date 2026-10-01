import type { AgeRating, RawGame, TimeToBeat } from "./igdb";
import { groupsOf } from "./igdb";
import { dateLabel } from "./format";

const iso = (seconds: number) =>
  new Date(seconds * 1000).toISOString().slice(0, 10);

function platformNames(game: RawGame) {
  const names = new Map<number, string>();
  for (const p of game.platforms ?? [])
    if (typeof p !== "number" && p.id)
      names.set(p.id, p.abbreviation || p.name || "");
  return names;
}

/** "PS5, PC — 24 марта 2023", one line per date, earliest first. */
export function releaseRows(game: RawGame) {
  const names = platformNames(game);
  const first = new Map<number, number>();
  for (const r of game.release_dates ?? [])
    if (r.date && r.platform && names.has(r.platform))
      first.set(r.platform, Math.min(first.get(r.platform) ?? r.date, r.date));
  const byDay = new Map<string, string[]>();
  for (const [platform, date] of [...first].sort((a, b) => a[1] - b[1])) {
    const day = iso(date);
    byDay.set(day, [...(byDay.get(day) ?? []), names.get(platform)!]);
  }
  return [...byDay].map(([day, platforms]) => ({
    date: dateLabel(day),
    day,
    platforms,
  }));
}

export function platformList(game: RawGame) {
  return [...platformNames(game).values()].filter(Boolean);
}

export function multiplayerLabel(game: RawGame) {
  const modes = game.multiplayer_modes ?? [];
  if (!modes.length) return "";
  const max = (key: "onlinemax" | "onlinecoopmax" | "offlinemax") =>
    Math.max(0, ...modes.map((m) => m[key] ?? 0));
  const has = (
    key: "onlinecoop" | "offlinecoop" | "splitscreen" | "campaigncoop",
  ) => modes.some((m) => m[key]);
  const parts: string[] = [];
  const online = max("onlinemax");
  if (online > 1) parts.push(`онлайн до ${online} игроков`);
  if (has("onlinecoop")) {
    const coop = max("onlinecoopmax");
    parts.push(
      coop > 1 ? `кооператив по сети до ${coop}` : "кооператив по сети",
    );
  }
  if (has("campaigncoop")) parts.push("сюжет вдвоём и больше");
  if (has("offlinecoop")) parts.push("кооператив на одном устройстве");
  if (has("splitscreen")) parts.push("разделённый экран");
  return parts.join(", ");
}

export function hours(seconds: number | null) {
  if (!seconds) return "";
  const h = seconds / 3600;
  return h < 1
    ? `${Math.max(1, Math.round(h * 60))} мин`
    : `${Math.round(h)} ч`;
}

export function timeToBeatLabel(t: TimeToBeat | null) {
  if (!t) return [];
  return [
    ["Сюжет", hours(t.hastily)],
    ["Сюжет и побочное", hours(t.normally)],
    ["На 100%", hours(t.completely)],
  ].filter(([, v]) => v) as Array<[string, string]>;
}

const AGE_WORDS: Record<string, string> = {
  Three: "3",
  Seven: "7",
  Twelve: "12",
  Sixteen: "16",
  Eighteen: "18",
  E10: "E10+",
};

/** "PEGI 18", "ESRB M"; PEGI first because it is used in Europe. */
export function ageLabels(list: AgeRating[]) {
  const order = ["PEGI", "ESRB", "USK", "CERO", "ACB", "GRAC", "CLASS_IND"];
  return list
    .filter((a) => order.includes(a.org))
    .sort((a, b) => order.indexOf(a.org) - order.indexOf(b.org))
    .map((a) => {
      const value = AGE_WORDS[a.rating] || a.rating;
      // Some categories already carry the organization, e.g. "PEGI 18".
      return value.toUpperCase().startsWith(a.org)
        ? value
        : `${a.org} ${value}`;
    });
}

const STEAM_REVIEWS: Record<number, string> = {
  9: "крайне положительные",
  8: "очень положительные",
  7: "положительные",
  6: "в основном положительные",
  5: "смешанные",
  4: "в основном отрицательные",
  3: "отрицательные",
  2: "очень отрицательные",
  1: "крайне отрицательные",
};

export const steamReviewLabel = (score: number) => STEAM_REVIEWS[score] || "";

const TIERS: Record<string, { label: string; color: string }> = {
  Mighty: { label: "могучая", color: "#ff6b3d" },
  Strong: { label: "сильная", color: "#b07cff" },
  Fair: { label: "средняя", color: "#4da3ff" },
  Weak: { label: "слабая", color: "#7cbf6f" },
};

export const tierOf = (tier: string | null) =>
  (tier && TIERS[tier]) || { label: "", color: "#ff9e64" };

export type GameLink = { label: string; href: string; search?: boolean };

const STORES: Array<[RegExp, string]> = [
  [/store\.steampowered\.com/, "Steam"],
  [/store\.epicgames\.com|epicgames\.com\/store/, "Epic Games Store"],
  [/gog\.com/, "GOG"],
  [
    /store\.playstation\.com|playstation\.com\/[^/]+\/games/,
    "PlayStation Store",
  ],
  [
    /xbox\.com|apps\.microsoft\.com|microsoft\.com\/[^/]+\/p\//,
    "Microsoft Store",
  ],
  [/nintendo\.[a-z.]+\//, "Nintendo eShop"],
  [/itch\.io/, "itch.io"],
];

const OTHER: Array<[RegExp, string]> = [
  [/wikipedia\.org/, "Википедия"],
  [/fandom\.com/, "Вики фанатов"],
  [/reddit\.com/, "Reddit"],
  [/discord\.(gg|com)/, "Discord"],
  [/twitch\.tv/, "Twitch"],
  [/youtube\.com/, "YouTube"],
  [/(twitter|x)\.com/, "X"],
];

const SKIP =
  /facebook\.com|instagram\.com|tiktok\.com|vk\.com|igdb\.com|apple\.com|play\.google\.com|bsky\.app|threads\.net/;

/** Stores first, then official site and communities; missing console stores become searches. */
export function gameLinks(game: RawGame, steamId: number | null) {
  const stores: GameLink[] = [];
  const other: GameLink[] = [];
  let official = false;
  const seen = new Set<string>();
  const add = (list: GameLink[], link: GameLink) => {
    if (seen.has(link.label)) return;
    seen.add(link.label);
    list.push(link);
  };
  for (const { url } of game.websites ?? []) {
    if (!url || !/^https?:\/\//.test(url) || SKIP.test(url)) continue;
    const store = STORES.find(([re]) => re.test(url));
    if (store) {
      add(stores, { label: store[1], href: url });
      continue;
    }
    const known = OTHER.find(([re]) => re.test(url));
    if (known) add(other, { label: known[1], href: url });
    else if (!official) {
      official = true;
      other.unshift({ label: "Официальный сайт", href: url });
    }
  }
  if (steamId && !seen.has("Steam"))
    add(stores, {
      label: "Steam",
      href: `https://store.steampowered.com/app/${steamId}/`,
    });
  const groups = groupsOf(
    (game.platforms ?? []).map((p) => (typeof p === "number" ? p : p.id || 0)),
  );
  const q = encodeURIComponent(game.name);
  if (groups.includes("playstation") && !seen.has("PlayStation Store"))
    add(stores, {
      label: "PlayStation Store",
      href: `https://store.playstation.com/search/${q}`,
      search: true,
    });
  if (groups.includes("xbox") && !seen.has("Microsoft Store"))
    add(stores, {
      label: "Microsoft Store",
      href: `https://www.xbox.com/search/results/games?q=${q}`,
      search: true,
    });
  if (groups.includes("nintendo") && !seen.has("Nintendo eShop"))
    add(stores, {
      label: "Nintendo eShop",
      href: `https://www.nintendo.com/search/#q=${q}`,
      search: true,
    });
  other.push({
    label: "IGDB",
    href: `https://www.igdb.com/games/${game.slug || game.id}`,
  });
  return { stores, other };
}
