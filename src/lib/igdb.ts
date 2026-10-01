import { igdb } from "./api";

/**
 * Games come from IGDB through the API worker. Queries ask only for fields
 * that have been stable for years; newer or rarer data (age ratings, Russian
 * language, time to beat) is asked separately and may fail on its own.
 */

export type Img = { image_id?: string };
type Named = { id?: number; name?: string };

export type RawGame = {
  id: number;
  name: string;
  slug?: string;
  summary?: string;
  storyline?: string;
  first_release_date?: number;
  game_type?: number;
  cover?: Img;
  artworks?: Img[];
  screenshots?: Img[];
  videos?: Array<{ video_id?: string; name?: string }>;
  platforms?: Array<number | (Named & { abbreviation?: string })>;
  genres?: Named[];
  themes?: Named[];
  game_modes?: Named[];
  player_perspectives?: Named[];
  involved_companies?: Array<{
    developer?: boolean;
    publisher?: boolean;
    porting?: boolean;
    company?: Named;
  }>;
  aggregated_rating?: number;
  aggregated_rating_count?: number;
  rating?: number;
  rating_count?: number;
  total_rating?: number;
  total_rating_count?: number;
  hypes?: number;
  release_dates?: Array<{ date?: number; platform?: number }>;
  websites?: Array<{ url?: string }>;
  external_games?: Array<{ uid?: string; url?: string }>;
  franchises?: Named[];
  collections?: Named[];
  multiplayer_modes?: Array<{
    campaigncoop?: boolean;
    onlinecoop?: boolean;
    onlinecoopmax?: number;
    onlinemax?: number;
    offlinecoop?: boolean;
    offlinemax?: number;
    splitscreen?: boolean;
  }>;
  similar_games?: RawGame[];
  dlcs?: RawGame[];
  expansions?: RawGame[];
  remakes?: RawGame[];
  remasters?: RawGame[];
  parent_game?: RawGame;
};

/** What every shelf, grid and search result needs. */
export type GameSummary = {
  id: number;
  name: string;
  cover: string | null;
  released: number | null;
  year: number | null;
  platforms: number[];
  genres: string[];
  critics: number | null;
  users: number | null;
  type: number | null;
};

export const SUMMARY_FIELDS =
  "name,cover.image_id,first_release_date,platforms,genres.name,aggregated_rating,aggregated_rating_count,rating,rating_count,game_type";

/** Main games, expansions, standalone add-ons, remakes, remasters, ports. */
export const PLAYABLE = "game_type = (0,2,4,8,9,10,11) & version_parent = null";

export function imageUrl(id: string | undefined | null, size: string) {
  return id
    ? `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`
    : "";
}

/* ------------------------------------------------------------ platforms */

export const PLATFORM_GROUPS = [
  { id: "pc", name: "ПК", full: "PC", ids: [6], tint: "#66c0f4" },
  {
    id: "playstation",
    name: "PlayStation",
    full: "PlayStation 5 и 4",
    ids: [167, 48],
    tint: "#2e6bd6",
  },
  {
    id: "xbox",
    name: "Xbox",
    full: "Xbox Series и One",
    ids: [169, 49],
    tint: "#107c10",
  },
  {
    id: "nintendo",
    name: "Switch",
    full: "Nintendo Switch 2 и Switch",
    ids: [508, 130],
    tint: "#e60012",
  },
] as const;

export type PlatformGroupId = (typeof PLATFORM_GROUPS)[number]["id"];

export function platformGroup(id: string) {
  return PLATFORM_GROUPS.find((g) => g.id === id);
}

/** Which of the four groups a game is on. */
export function groupsOf(platforms: number[]): PlatformGroupId[] {
  return PLATFORM_GROUPS.filter((g) =>
    g.ids.some((id) => platforms.includes(id)),
  ).map((g) => g.id);
}

export function platformIds(groups: readonly string[]) {
  return PLATFORM_GROUPS.filter((g) => groups.includes(g.id)).flatMap((g) => [
    ...g.ids,
  ]);
}

/* --------------------------------------------------------- translations */

const GENRES_RU: Record<string, string> = {
  "Point-and-click": "Point-and-click",
  Fighting: "Файтинг",
  Shooter: "Шутер",
  Music: "Музыкальная",
  Platform: "Платформер",
  Puzzle: "Головоломка",
  Racing: "Гонки",
  "Real Time Strategy (RTS)": "Стратегия в реальном времени",
  "Role-playing (RPG)": "Ролевая",
  Simulator: "Симулятор",
  Sport: "Спорт",
  Strategy: "Стратегия",
  "Turn-based strategy (TBS)": "Пошаговая стратегия",
  Tactical: "Тактика",
  "Hack and slash/Beat 'em up": "Слэшер",
  "Quiz/Trivia": "Викторина",
  Pinball: "Пинбол",
  Adventure: "Приключения",
  Indie: "Инди",
  Arcade: "Аркада",
  "Visual Novel": "Визуальная новелла",
  "Card & Board Game": "Карточная и настольная",
  MOBA: "MOBA",
  // Themes
  Action: "Экшен",
  Fantasy: "Фэнтези",
  "Science fiction": "Научная фантастика",
  Horror: "Хоррор",
  Thriller: "Триллер",
  Survival: "Выживание",
  Historical: "Историческая",
  Stealth: "Стелс",
  Comedy: "Комедия",
  Business: "Бизнес",
  Drama: "Драма",
  "Non-fiction": "Документальная",
  Sandbox: "Песочница",
  Educational: "Обучающая",
  Kids: "Детская",
  "Open world": "Открытый мир",
  Warfare: "Военная",
  Party: "Для компании",
  "4X (explore, expand, exploit, and exterminate)": "4X",
  Erotic: "Эротика",
  Mystery: "Детектив",
  Romance: "Романтика",
};

const MODES_RU: Record<string, string> = {
  "Single player": "Одиночная игра",
  Multiplayer: "Мультиплеер",
  "Co-operative": "Кооператив",
  "Split screen": "Разделённый экран",
  "Massively Multiplayer Online (MMO)": "MMO",
  "Battle Royale": "Королевская битва",
  // Perspectives
  "First person": "От первого лица",
  "Third person": "От третьего лица",
  "Bird view / Isometric": "Изометрия",
  "Side view": "Вид сбоку",
  Text: "Текстовая",
  Auditory: "Звуковая",
  "Virtual Reality": "VR",
};

export const ru = (name?: string) =>
  (name && (GENRES_RU[name] || MODES_RU[name])) || name || "";

const GAME_TYPES: Record<number, string> = {
  1: "DLC",
  2: "Дополнение",
  3: "Сборник",
  4: "Самостоятельное дополнение",
  5: "Мод",
  6: "Эпизод",
  7: "Сезон",
  8: "Ремейк",
  9: "Ремастер",
  10: "Расширенное издание",
  11: "Порт",
};

export const gameTypeLabel = (type: number | null | undefined) =>
  (type != null && GAME_TYPES[type]) || "";

/** Genres the search can filter by: IGDB genres plus a few themes. */
export const GENRE_FILTERS = [
  { id: "g12", label: "Ролевые" },
  { id: "t1", label: "Экшен" },
  { id: "g31", label: "Приключения" },
  { id: "g5", label: "Шутеры" },
  { id: "t38", label: "Открытый мир" },
  { id: "t19", label: "Хорроры" },
  { id: "t21", label: "Выживание" },
  { id: "g15", label: "Стратегии" },
  { id: "g8", label: "Платформеры" },
  { id: "g9", label: "Головоломки" },
  { id: "g10", label: "Гонки" },
  { id: "g14", label: "Спорт" },
  { id: "g13", label: "Симуляторы" },
  { id: "g4", label: "Файтинги" },
  { id: "g32", label: "Инди" },
  { id: "g34", label: "Визуальные новеллы" },
] as const;

/* ------------------------------------------------------------ helpers */

export function toSummary(raw: RawGame): GameSummary {
  const released = raw.first_release_date ?? null;
  return {
    id: raw.id,
    name: raw.name,
    cover: raw.cover?.image_id ?? null,
    released,
    year: released ? new Date(released * 1000).getUTCFullYear() : null,
    platforms: (raw.platforms ?? []).map((p) =>
      typeof p === "number" ? p : p.id || 0,
    ),
    genres: (raw.genres ?? []).map((g) => ru(g.name)).filter(Boolean),
    critics:
      raw.aggregated_rating && (raw.aggregated_rating_count ?? 0) > 0
        ? Math.round(raw.aggregated_rating)
        : null,
    users:
      raw.rating && (raw.rating_count ?? 0) > 0
        ? Math.round(raw.rating) / 10
        : null,
    type: raw.game_type ?? null,
  };
}

/** One number to sort by: critics, else players scaled to 100. */
export const score = (g: GameSummary) =>
  g.critics ?? (g.users !== null ? g.users * 10 : 0);

/** Text is put inside a quoted IGDB string; quotes and backslashes go. */
export function clean(text: string) {
  return text.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** Midnight UTC, so a day's queries are identical and stay cached. */
export function today(now = Date.now()) {
  return Math.floor(now / 86_400_000) * 86_400;
}

const DAY = 86_400;

/* ------------------------------------------------------------- queries */

export async function gamesByIds(ids: number[], extra = "") {
  if (!ids.length) return [];
  const rows = await igdb<RawGame[]>(
    "games",
    `fields ${SUMMARY_FIELDS}; where id = (${ids.join(",")})${extra}; limit 500;`,
  );
  const byId = new Map(rows.map((r) => [r.id, toSummary(r)]));
  return ids.map((id) => byId.get(id)).filter((g): g is GameSummary => !!g);
}

export type Shelves = {
  popular: GameSummary[];
  fresh: GameSummary[];
  soon: GameSummary[];
  best: GameSummary[];
};

/** The four shelves of the feed for the given platforms. */
export async function shelves(platforms: number[]): Promise<Shelves> {
  const on = platforms.length ? ` & platforms = (${platforms.join(",")})` : "";
  const now = today();
  const results = await igdb<Array<{ name: string; result: RawGame[] }>>(
    "multiquery",
    [
      `query popularity_primitives "popular" { fields game_id,value; where popularity_type = 1; sort value desc; limit 200; };`,
      `query games "fresh" { fields ${SUMMARY_FIELDS}; where ${PLAYABLE}${on} & first_release_date >= ${now - 60 * DAY} & first_release_date < ${now + DAY}; sort hypes desc; limit 30; };`,
      `query games "soon" { fields ${SUMMARY_FIELDS}; where ${PLAYABLE}${on} & first_release_date >= ${now + DAY}; sort hypes desc; limit 30; };`,
      `query games "best" { fields ${SUMMARY_FIELDS}; where ${PLAYABLE}${on} & first_release_date >= ${now - 365 * DAY} & aggregated_rating_count >= 8; sort aggregated_rating desc; limit 30; };`,
    ].join("\n"),
  );
  const part = (name: string) =>
    (results.find((r) => r.name === name)?.result ?? []) as RawGame[];
  const popularIds = (part("popular") as unknown as Array<{ game_id?: number }>)
    .map((p) => p.game_id)
    .filter((id): id is number => typeof id === "number");
  const popular = await gamesByIds(
    [...new Set(popularIds)],
    `${on} & ${PLAYABLE}`,
  ).catch(() => []);
  return {
    popular: popular.slice(0, 30),
    fresh: part("fresh").map(toSummary),
    soon: part("soon")
      .map(toSummary)
      .sort((a, b) => (a.released ?? 0) - (b.released ?? 0)),
    best: part("best").map(toSummary),
  };
}

export type SearchSort = "relevance" | "popular" | "rating" | "new";

export type SearchFilters = {
  platforms: number[];
  genre: string | null;
  year: number | null;
  minCritics: number;
  sort: SearchSort;
};

function filterClause(f: SearchFilters) {
  const parts = [PLAYABLE];
  if (f.platforms.length) parts.push(`platforms = (${f.platforms.join(",")})`);
  if (f.genre) {
    const id = Number(f.genre.slice(1));
    parts.push(
      f.genre.startsWith("t") ? `themes = (${id})` : `genres = (${id})`,
    );
  }
  if (f.year) {
    const from = Date.UTC(f.year, 0, 1) / 1000;
    const to = Date.UTC(f.year + 1, 0, 1) / 1000;
    parts.push(`first_release_date >= ${from} & first_release_date < ${to}`);
  }
  if (f.minCritics)
    parts.push(
      `aggregated_rating >= ${f.minCritics} & aggregated_rating_count >= 3`,
    );
  return parts.join(" & ");
}

export const SEARCH_PAGE = 40;

/** Name search, or browsing by filters when the query is empty. */
export async function searchGames(
  query: string,
  filters: SearchFilters,
  offset = 0,
) {
  const text = clean(query);
  const where = filterClause(filters);
  if (text) {
    const rows = await igdb<RawGame[]>(
      "games",
      `search "${text}"; fields ${SUMMARY_FIELDS},total_rating_count; where ${where}; limit ${SEARCH_PAGE}; offset ${offset};`,
    );
    const list = rows.map((r) => ({
      ...toSummary(r),
      votes: r.total_rating_count ?? 0,
    }));
    if (filters.sort === "popular") list.sort((a, b) => b.votes - a.votes);
    if (filters.sort === "rating") list.sort((a, b) => score(b) - score(a));
    if (filters.sort === "new")
      list.sort((a, b) => (b.released ?? 0) - (a.released ?? 0));
    return { list: list as GameSummary[], more: rows.length === SEARCH_PAGE };
  }
  const order =
    filters.sort === "rating"
      ? `& aggregated_rating_count >= 5; sort aggregated_rating desc`
      : filters.sort === "new"
        ? `& first_release_date < ${today() + DAY}; sort first_release_date desc`
        : `& total_rating_count > 0; sort total_rating_count desc`;
  const rows = await igdb<RawGame[]>(
    "games",
    `fields ${SUMMARY_FIELDS}; where ${where} ${order}; limit ${SEARCH_PAGE}; offset ${offset};`,
  );
  return { list: rows.map(toSummary), more: rows.length === SEARCH_PAGE };
}

/* ---------------------------------------------------------- game page */

const RELATED = "name,cover.image_id,first_release_date,game_type";

const DETAIL_FIELDS = [
  "name,slug,summary,storyline,first_release_date,game_type,hypes",
  "cover.image_id,artworks.image_id,screenshots.image_id",
  "videos.video_id,videos.name",
  "platforms.name,platforms.abbreviation",
  "genres.name,themes.name,game_modes.name,player_perspectives.name",
  "involved_companies.developer,involved_companies.publisher,involved_companies.porting,involved_companies.company.name",
  "aggregated_rating,aggregated_rating_count,rating,rating_count,total_rating_count",
  "release_dates.date,release_dates.platform",
  "websites.url,external_games.uid,external_games.url",
  "franchises.name,collections.name",
  "multiplayer_modes.campaigncoop,multiplayer_modes.onlinecoop,multiplayer_modes.onlinecoopmax,multiplayer_modes.onlinemax,multiplayer_modes.offlinecoop,multiplayer_modes.offlinemax,multiplayer_modes.splitscreen",
  ...[
    "similar_games",
    "dlcs",
    "expansions",
    "remakes",
    "remasters",
    "parent_game",
  ].map((f) =>
    RELATED.split(",")
      .map((x) => `${f}.${x}`)
      .join(","),
  ),
].join(",");

export async function gameDetails(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("HTTP_404");
  const rows = await igdb<RawGame[]>(
    "games",
    `fields ${DETAIL_FIELDS}; where id = ${id};`,
  );
  if (!rows[0]) throw new Error("HTTP_404");
  return rows[0];
}

/** Other games of the same series, oldest first. */
export async function seriesGames(collectionId: number, except: number) {
  const rows = await igdb<RawGame[]>(
    "games",
    `fields ${SUMMARY_FIELDS}; where collections = (${collectionId}) & ${PLAYABLE} & id != ${except}; sort first_release_date asc; limit 50;`,
  );
  return rows.map(toSummary);
}

export type AgeRating = { org: string; rating: string };

export async function ageRatings(id: number): Promise<AgeRating[]> {
  const rows = await igdb<
    Array<{
      age_ratings?: Array<{
        organization?: { name?: string };
        rating_category?: { rating?: string };
      }>;
    }>
  >(
    "games",
    `fields age_ratings.organization.name,age_ratings.rating_category.rating; where id = ${id};`,
  );
  return (rows[0]?.age_ratings ?? [])
    .map((r) => ({
      org: r.organization?.name || "",
      rating: r.rating_category?.rating || "",
    }))
    .filter((r) => r.org && r.rating);
}

export type RussianSupport = {
  interface: boolean;
  subtitles: boolean;
  audio: boolean;
};

/** Which parts of the game are in Russian; null when IGDB has no data. */
export async function russianSupport(
  id: number,
): Promise<RussianSupport | null> {
  const rows = await igdb<
    Array<{
      language?: { name?: string; locale?: string };
      language_support_type?: { name?: string };
    }>
  >(
    "language_supports",
    `fields language.name,language.locale,language_support_type.name; where game = ${id}; limit 200;`,
  );
  if (!rows.length) return null;
  const kinds = new Set(
    rows
      .filter(
        (r) =>
          r.language?.locale?.startsWith("ru") ||
          r.language?.name === "Russian",
      )
      .map((r) => (r.language_support_type?.name || "").toLowerCase()),
  );
  return {
    interface: kinds.has("interface"),
    subtitles: kinds.has("subtitles"),
    audio: kinds.has("audio"),
  };
}

export type TimeToBeat = {
  hastily: number | null;
  normally: number | null;
  completely: number | null;
  count: number;
};

export async function timeToBeat(id: number): Promise<TimeToBeat | null> {
  const rows = await igdb<
    Array<{
      hastily?: number;
      normally?: number;
      completely?: number;
      count?: number;
    }>
  >(
    "game_time_to_beats",
    `fields hastily,normally,completely,count; where game_id = ${id};`,
  );
  const row = rows[0];
  if (!row || !(row.hastily || row.normally || row.completely)) return null;
  return {
    hastily: row.hastily || null,
    normally: row.normally || null,
    completely: row.completely || null,
    count: row.count ?? 0,
  };
}

/** Steam app id from the store links IGDB keeps for a game. */
export function steamAppId(game: RawGame) {
  const urls = [
    ...(game.external_games ?? []).map((e) => e.url || ""),
    ...(game.websites ?? []).map((w) => w.url || ""),
  ];
  for (const url of urls) {
    const match = url.match(/store\.steampowered\.com\/app\/(\d+)/);
    if (match) return Number(match[1]);
  }
  return null;
}

/* ----------------------------------------------------- studio and legacy */

export async function companyGames(id: number) {
  const rows = await igdb<
    Array<{
      name?: string;
      description?: string;
      country?: number;
      logo?: Img;
      start_date?: number;
      websites?: Array<{ url?: string }>;
      developed?: RawGame[];
      published?: RawGame[];
    }>
  >(
    "companies",
    `fields name,description,logo.image_id,start_date,websites.url,developed.${SUMMARY_FIELDS.split(",").join(",developed.")},published.${SUMMARY_FIELDS.split(",").join(",published.")}; where id = ${id};`,
  );
  const c = rows[0];
  if (!c) throw new Error("HTTP_404");
  const seen = new Set<number>();
  const games = [...(c.developed ?? []), ...(c.published ?? [])]
    .filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)))
    .filter(
      (g) =>
        g.game_type == null || [0, 2, 4, 8, 9, 10, 11].includes(g.game_type),
    )
    .map(toSummary)
    .sort((a, b) => (b.released ?? 9e9) - (a.released ?? 9e9));
  return {
    name: c.name || "",
    description: c.description || "",
    logo: c.logo?.image_id ?? null,
    founded: c.start_date
      ? new Date(c.start_date * 1000).getUTCFullYear()
      : null,
    website: c.websites?.[0]?.url || "",
    developed: new Set((c.developed ?? []).map((g) => g.id)),
    games,
  };
}

export async function companyIdByName(name: string) {
  const rows = await igdb<Array<{ id: number }>>(
    "companies",
    `fields id; where name = "${clean(name)}"; limit 1;`,
  );
  return rows[0]?.id ?? null;
}

/** Steam app ids → IGDB game ids, for library entries saved before IGDB. */
export async function idsFromSteam(appIds: number[]) {
  if (!appIds.length) return new Map<number, number>();
  const rows = await igdb<Array<{ game?: number; uid?: string; url?: string }>>(
    "external_games",
    `fields game,uid,url; where uid = (${appIds.map((id) => `"${id}"`).join(",")}); limit 500;`,
  );
  const map = new Map<number, number>();
  for (const r of rows)
    if (r.game && r.uid && /steampowered\.com\/app\//.test(r.url || ""))
      map.set(Number(r.uid), r.game);
  return map;
}

export async function idByTitle(title: string) {
  const text = clean(title);
  if (!text) return null;
  const rows = await igdb<Array<{ id: number }>>(
    "games",
    `search "${text}"; fields id; where version_parent = null; limit 1;`,
  );
  return rows[0]?.id ?? null;
}
