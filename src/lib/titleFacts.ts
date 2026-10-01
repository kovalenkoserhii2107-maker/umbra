import { dateLabel, plural } from "./format";
import type {
  MediaType,
  PersonRef,
  TitleDetails,
  Video,
  WatchGroup,
  WatchProvider,
} from "./tmdb";

/** Age rating for the region, else the US one, e.g. { code: "16+", country: "UA" }. */
export function certification(
  item: TitleDetails,
  media: MediaType,
  region: string,
): { code: string; country: string } | null {
  const pick = (country: string) => {
    if (media === "tv")
      return item.content_ratings?.results.find(
        (r) => r.iso_3166_1 === country && r.rating,
      )?.rating;
    return item.release_dates?.results
      .find((r) => r.iso_3166_1 === country)
      ?.release_dates.find((d) => d.certification?.trim())
      ?.certification?.trim();
  };
  for (const country of [region, "US"]) {
    const code = pick(country);
    if (code) return { code, country };
  }
  return null;
}

const RELEASE_TYPES: Record<number, string> = {
  1: "Премьера",
  2: "Ограниченный прокат",
  3: "В кино",
  4: "Онлайн",
  5: "На дисках",
  6: "На ТВ",
};

/** The first date of each release type in the region, in date order. */
export function regionalDates(item: TitleDetails, region: string) {
  const rows =
    item.release_dates?.results.find((r) => r.iso_3166_1 === region)
      ?.release_dates ?? [];
  const first = new Map<number, string>();
  for (const r of rows) {
    const date = r.release_date.slice(0, 10);
    if (!RELEASE_TYPES[r.type]) continue;
    if (!first.has(r.type) || date < first.get(r.type)!)
      first.set(r.type, date);
  }
  return [...first.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([type, date]) => ({
      label: RELEASE_TYPES[type],
      date: dateLabel(date),
    }));
}

const STATUS: Record<string, string> = {
  "Returning Series": "Продолжается",
  Ended: "Завершён",
  Canceled: "Закрыт",
  Cancelled: "Закрыт",
  "In Production": "В производстве",
  Planned: "Запланирован",
  Pilot: "Пилот",
  Released: "Вышел",
  "Post Production": "Постпродакшн",
  Rumored: "Анонсирован",
};
export const statusLabel = (status?: string) =>
  (status && STATUS[status]) || null;

const SHOW_TYPES: Record<string, string> = {
  Miniseries: "Мини-сериал",
  Documentary: "Документальный",
  Reality: "Реалити-шоу",
  "Talk Show": "Ток-шоу",
  News: "Новости",
  Video: "Видео",
};
export const showTypeLabel = (type?: string) =>
  (type && SHOW_TYPES[type]) || null;

function intlName(type: "language" | "region", code?: string) {
  if (!code) return null;
  try {
    const name = new Intl.DisplayNames(["ru"], { type }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}
export const languageName = (code?: string) => intlName("language", code);
export const countryName = (code?: string) => intlName("region", code);

/** "$390 млн", "$1,2 млрд"; null for unknown (TMDB uses 0). */
export function money(value?: number | string | null) {
  const n =
    typeof value === "string" ? Number(value.replace(/[$,]/g, "")) : value || 0;
  if (!Number.isFinite(n) || n <= 0) return null;
  const fmt = (v: number, digits: number) =>
    v.toLocaleString("ru-RU", { maximumFractionDigits: digits });
  if (n >= 1e9) return `$${fmt(n / 1e9, 1)} млрд`;
  if (n >= 1e6) return `$${fmt(n / 1e6, 0)} млн`;
  return `$${fmt(n / 1e3, 0)} тыс.`;
}

/** "828 тыс. голосов", "1,2 млн голосов". */
export function votesLabel(n?: number | null) {
  if (!n) return null;
  const word = plural(n, "голос", "голоса", "голосов");
  if (n >= 1e6)
    return `${(n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн голосов`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} тыс. голосов`;
  return `${n} ${word}`;
}

/** Compact count for rating tiles: "828 тыс.", "1,2 млн", "639". */
export function votesShort(n?: number | null) {
  if (!n) return null;
  if (n >= 1e6)
    return `${(n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} тыс.`;
  return String(n);
}

const AWARD_NAMES: Array<[RegExp, string]> = [
  [/^Oscars?$/, "«Оскар»"],
  [/^Primetime Emmys?$/, "«Эмми»"],
  [/^Golden Globes?$/, "«Золотой глобус»"],
  [/^BAFTA (Film |TV )?Awards?$/, "BAFTA"],
];

/** OMDb awards in Russian; the original text when the format is unfamiliar. */
export function awardsLabel(text?: string | null) {
  if (!text) return null;
  const parts: string[] = [];
  let rest = text.trim();
  const head = rest.match(/^(Won|Nominated for) (\d+) ([^.]+)\.\s*/);
  if (head) {
    const name = AWARD_NAMES.find(([re]) => re.test(head[3]))?.[1];
    if (!name) return text;
    const n = Number(head[2]);
    parts.push(
      head[1] === "Won"
        ? `${name}: ${n} ${plural(n, "победа", "победы", "побед")}`
        : `${name}: ${n} ${plural(n, "номинация", "номинации", "номинаций")}`,
    );
    rest = rest.slice(head[0].length);
  }
  if (rest) {
    const total = rest.match(
      /^(?:(\d+) wins?)?(?: & )?(?:(\d+) nominations?)? total\.?$/,
    );
    if (!total) return text;
    const wins = Number(total[1] || 0);
    const noms = Number(total[2] || 0);
    const bits = [
      wins ? `${wins} ${plural(wins, "награда", "награды", "наград")}` : "",
      noms
        ? `${noms} ${plural(noms, "номинация", "номинации", "номинаций")}`
        : "",
    ].filter(Boolean);
    if (bits.length) parts.push(`всего ${bits.join(" и ")}`);
  }
  return parts.length ? parts.join(" · ") : text;
}

export type ProviderGroup = { label: string; providers: WatchProvider[] };

/** Subscription, free, with ads, rent and buy — each provider once per group. */
export function providerGroups(region?: WatchGroup): ProviderGroup[] {
  if (!region) return [];
  const groups: Array<[keyof WatchGroup, string]> = [
    ["flatrate", "По подписке"],
    ["free", "Бесплатно"],
    ["ads", "С рекламой"],
    ["rent", "Аренда"],
    ["buy", "Покупка"],
  ];
  return groups
    .map(([key, label]) => {
      const seen = new Set<number>();
      const providers = (
        (region[key] as WatchProvider[] | undefined) ?? []
      ).filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id));
      return { label, providers };
    })
    .filter((g) => g.providers.length);
}

/** YouTube videos with the main trailer first: Russian, then English. */
export function sortedVideos(videos: Video[] = []) {
  const kind: Record<string, number> = {
    Trailer: 0,
    Teaser: 1,
    Clip: 2,
    Featurette: 3,
    "Behind the Scenes": 4,
  };
  const lang = (v: Video) => (v.iso_639_1 === "ru" ? 0 : 1);
  return videos
    .filter((v) => v.site === "YouTube" && v.key)
    .sort(
      (a, b) =>
        (kind[a.type] ?? 9) - (kind[b.type] ?? 9) ||
        lang(a) - lang(b) ||
        Number(b.official) - Number(a.official),
    );
}

export const VIDEO_TYPES: Record<string, string> = {
  Trailer: "Трейлер",
  Teaser: "Тизер",
  Clip: "Фрагмент",
  Featurette: "О съёмках",
  "Behind the Scenes": "За кадром",
  Bloopers: "Неудачные дубли",
  "Opening Credits": "Вступление",
};

/** Official site, IMDb, TMDB, Wikidata and social pages. */
export function externalLinks(item: TitleDetails, media: MediaType) {
  const ids = item.external_ids || {};
  const links: Array<{ label: string; href: string }> = [];
  if (item.homepage && /^https?:\/\//.test(item.homepage))
    links.push({ label: "Официальный сайт", href: item.homepage });
  if (ids.imdb_id)
    links.push({
      label: "IMDb",
      href: `https://www.imdb.com/title/${ids.imdb_id}/`,
    });
  links.push({
    label: "TMDB",
    href: `https://www.themoviedb.org/${media}/${item.id}`,
  });
  if (ids.wikidata_id)
    links.push({
      label: "Wikidata",
      href: `https://www.wikidata.org/wiki/${ids.wikidata_id}`,
    });
  if (ids.instagram_id)
    links.push({
      label: "Instagram",
      href: `https://www.instagram.com/${ids.instagram_id}/`,
    });
  if (ids.twitter_id)
    links.push({ label: "X", href: `https://x.com/${ids.twitter_id}` });
  if (ids.facebook_id)
    links.push({
      label: "Facebook",
      href: `https://www.facebook.com/${ids.facebook_id}`,
    });
  return links;
}

const EXTRA_CREW: Array<[string, string[]]> = [
  ["Композитор", ["Original Music Composer", "Music", "Composer"]],
  ["Оператор", ["Director of Photography", "Cinematography"]],
  ["Монтаж", ["Editor"]],
  ["Художник-постановщик", ["Production Design"]],
];

/** Composer, cinematographer, editor and production designer. */
export function extraCrew(item: TitleDetails) {
  const crew = item.credits?.crew ?? [];
  return EXTRA_CREW.map(([role, jobs]) => {
    const seen = new Set<number>();
    const people = crew.filter(
      (c) => c.job && jobs.includes(c.job) && !seen.has(c.id) && seen.add(c.id),
    );
    return { role, people };
  }).filter((row) => row.people.length);
}

const MAIN_CREW: Array<[string, string[]]> = [
  ["Режиссёр", ["Director"]],
  [
    "Сценарий",
    [
      "Screenplay",
      "Writer",
      "Story",
      "Teleplay",
      "Series Composition",
      "Novel",
    ],
  ],
  ["Продюсеры", ["Producer"]],
];

/** Director, creators, writers, producers, then composer, camera and the rest. */
export function crewRows(item: TitleDetails) {
  const crew = item.credits?.crew ?? [];
  const pick = (jobs: string[]) => {
    const seen = new Set<number>();
    return crew.filter(
      (c) => c.job && jobs.includes(c.job) && !seen.has(c.id) && seen.add(c.id),
    );
  };
  const rows: Array<{ role: string; people: PersonRef[] }> = [];
  for (const [role, jobs] of MAIN_CREW) {
    if (role === "Сценарий" && item.created_by?.length)
      rows.push({ role: "Создатели", people: item.created_by });
    const people = pick(jobs);
    if (people.length) rows.push({ role, people });
  }
  return [...rows, ...extraCrew(item)];
}
