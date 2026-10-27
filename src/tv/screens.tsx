import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAsync } from "../components";
import { FEEDS, loadFeedPage, type FeedId } from "../lib/feeds";
import { tasteSeed } from "../lib/spotlight";
import {
  continueWatching,
  episodeLabel,
  loadWatchingShows,
} from "../lib/tracking";
import { tmdb, type MediaType, type TmdbItem } from "../lib/tmdb";
import { byCatalogRank } from "../lib/rank";
import { useAppState, type LibraryItem } from "../state";
import { cardsOf, fromLibrary, type CardRow } from "./cards";
import { RowsScreen } from "./RowsScreen";
import { Pill } from "./ui";
import { useTvBack } from "../components/TvFocus";
import { useLibraryMeta } from "../lib/meta";
import {
  DECADES,
  RATING_BANDS,
  SORTS,
  filterCollection,
  genresOf,
  type CollectionFilters,
} from "../lib/collection";

const recent = (a: LibraryItem, b: LibraryItem) => b.updatedAt - a.updatedAt;

function useFeed(id: FeedId, seed?: { type: MediaType; id: number }) {
  const key = seed
    ? `tv:feed:${id}:${seed.type}:${seed.id}`
    : `tv:feed:${id}`;
  return useAsync(
    () => loadFeedPage(id, 1, seed),
    [id, seed?.type, seed?.id],
    key,
  );
}

const feedRow = (id: FeedId, data: { results: TmdbItem[] } | null): CardRow => {
  const meta = FEEDS.find((f) => f.id === id)!;
  return {
    key: id,
    title: meta.title,
    cards: cardsOf(data?.results ?? [], meta.type),
  };
};

/** Стрічка: what you are watching and want to watch first, then the catalog. */
export function TvHome() {
  const { uid, libraryReady, items } = useAppState();
  const seed = tasteSeed(items);
  const watchingItems = items.filter(
    (x) => x.type === "tv" && x.status === "watching",
  );
  const watchingKey = watchingItems.map((x) => x.id).join();
  const trending = useFeed("trending");
  const theaters = useFeed("theaters");
  const shows = useAsync(
    () => loadWatchingShows(items),
    [watchingKey],
    `tv:watching:${uid ?? ""}:${watchingKey}`,
  );
  const airing = useFeed("airing");
  const recs = useAsync(
    () =>
      seed
        ? loadFeedPage("recs", 1, { type: seed.type, id: seed.id })
        : Promise.resolve(null),
    [seed?.type, seed?.id],
    `tv:recs:${seed?.type ?? ""}:${seed?.id ?? ""}`,
  );
  const upcoming = useFeed("upcoming");
  const upcomingTv = useFeed("upcoming-tv");
  const topMovies = useFeed("imdb250-movie");
  const topTv = useFeed("imdb250-tv");

  // The top rails appear together, once: later changes never blank them again.
  const [settled, setSettled] = useState(false);
  const ready =
    libraryReady &&
    (!watchingItems.length || !shows.loading) &&
    !trending.loading &&
    !theaters.loading;
  const topSettled = settled || ready;

  useEffect(() => {
    if (settled) return;
    if (ready) {
      setSettled(true);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), 700);
    return () => window.clearTimeout(timer);
  }, [ready, settled]);

  // Rows are rebuilt only when their data changes: posters skip re-rendering.
  const rows: CardRow[] = useMemo(() => {
    const built: CardRow[] = [
      {
        key: "continue",
        title: "Продовжити дивитися",
        cards: continueWatching(items, shows.data ?? {}).map((c) =>
          fromLibrary(c.item, c.next ? episodeLabel(c.next) : undefined),
        ),
      },
      {
        key: "watchlist",
        title: "Хочу подивитися",
        cards: items
          .filter((x) => x.status === "watchlist")
          .sort(recent)
          .map((x) => fromLibrary(x)),
      },
      feedRow("trending", trending.data),
      feedRow("theaters", theaters.data),
      feedRow("airing", airing.data),
      feedRow("recs", recs.data),
      feedRow("upcoming", upcoming.data),
      feedRow("upcoming-tv", upcomingTv.data),
      feedRow("imdb250-movie", topMovies.data),
      feedRow("imdb250-tv", topTv.data),
    ];
    return topSettled ? built : built.map((r) => ({ ...r, cards: [] }));
  }, [
    topSettled,
    items,
    shows.data,
    trending.data,
    theaters.data,
    airing.data,
    recs.data,
    upcoming.data,
    upcomingTv.data,
    topMovies.data,
    topTv.data,
  ]);
  const failed = [theaters, trending].every((x) => x.error);
  return (
    <RowsScreen
      tab="/"
      rows={rows}
      empty={
        failed ? "Каталог зараз не відповідає. Перевір інтернет." : "Завантажую…"
      }
    />
  );
}

type Filters = Omit<CollectionFilters, "q" | "status">;

const NO_FILTERS: Filters = {
  type: "all",
  genre: "",
  rating: "all",
  decade: "all",
  sort: "recent",
};

/** The filters stay while the app is open, like on a TV's own screens. */
let kept: Filters = NO_FILTERS;

type Group = {
  key: keyof Filters;
  label: string;
  options: Array<{ id: string; label: string }>;
};

/** Колекція: the library as rows by status, with filters on top. */
export function TvCollection() {
  const { items } = useAppState();
  const { meta } = useLibraryMeta(items);
  const [filters, setFilters] = useState<Filters>(kept);
  const [open, setOpen] = useState<keyof Filters | null>(null);
  const genres = useMemo(() => genresOf(items, meta), [items, meta]);

  const groups: Group[] = [
    {
      key: "type",
      label: "Тип",
      options: [
        { id: "all", label: "Фільми та серіали" },
        { id: "movie", label: "Фільми" },
        { id: "tv", label: "Серіали" },
      ],
    },
    {
      key: "genre",
      label: "Жанр",
      options: [
        { id: "", label: "Всі жанри" },
        ...genres.map((g) => ({ id: g, label: g })),
      ],
    },
    { key: "rating", label: "Оцінка", options: RATING_BANDS },
    { key: "decade", label: "Роки", options: DECADES },
    { key: "sort", label: "Порядок", options: SORTS },
  ];
  /** Short labels for the chips; the full ones are in the list of choices. */
  const SHORT: Partial<Record<keyof Filters, string>> = {
    type: "всі",
    genre: "всі",
    rating: "будь-яка",
    decade: "будь-які",
    sort: "нещодавні",
  };
  const valueOf = (g: Group) => {
    if (filters[g.key] === NO_FILTERS[g.key]) return SHORT[g.key];
    const label = g.options.find((o) => o.id === filters[g.key])?.label ?? "";
    return g.key === "sort"
      ? label.replace(/^За |^Спочатку /, "").toLowerCase()
      : label;
  };
  const openGroup = groups.find((g) => g.key === open);

  const rows: CardRow[] = useMemo(() => {
    const list = filterCollection(
      items,
      { ...filters, q: "", status: "all" },
      meta,
    );
    const by = (status: LibraryItem["status"]) =>
      list.filter((x) => x.status === status);
    return [
      {
        key: "watching",
        title: "Дивлюся",
        cards: by("watching").map((x) =>
          fromLibrary(
            x,
            x.season && x.episode ? `S${x.season}E${x.episode}` : undefined,
          ),
        ),
      },
      {
        key: "watchlist",
        title: "Хочу подивитися",
        cards: by("watchlist").map((x) => fromLibrary(x)),
      },
      {
        key: "watched",
        title: "Переглянуто",
        cards: by("watched").map((x) =>
          fromLibrary(x, x.rating ? `★ ${x.rating}` : undefined),
        ),
      },
      {
        key: "dropped",
        title: "Покинуто",
        cards: by("dropped").map((x) => fromLibrary(x)),
      },
    ];
  }, [items, meta, filters]);

  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  // Back with a list of options open closes it first.
  useTvBack(open !== null, () => setOpen(null));

  return (
    <RowsScreen
      tab="/library"
      rows={rows}
      empty={
        filtered
          ? "Під ці фільтри нічого немає. Зміни їх угорі."
          : "Колекція поки порожня. Відкрий фільм і натисни «Хочу подивитися»."
      }
      toolbar={(focus) => ({
        lanes: [
          {
            key: "filters",
            size: groups.length + (filtered ? 1 : 0),
            onSelect: (i) => {
              const g = groups[i];
              if (!g) {
                kept = NO_FILTERS;
                setFilters(NO_FILTERS);
                return;
              }
              setOpen(g.key);
              focus(
                "options",
                Math.max(
                  0,
                  g.options.findIndex((o) => o.id === filters[g.key]),
                ),
              );
            },
          },
          {
            key: "options",
            size: openGroup?.options.length ?? 0,
            onSelect: (i) => {
              const option = openGroup?.options[i];
              if (!openGroup || !option) return;
              const next = { ...filters, [openGroup.key]: option.id };
              kept = next;
              setFilters(next);
              setOpen(null);
              focus(
                "filters",
                groups.findIndex((g) => g.key === openGroup.key),
              );
            },
          },
        ],
        node: (at) => (
          <div className="absolute inset-x-0 top-[66px] z-10">
            <div data-lane="filters" className="flex gap-2 px-12">
              {groups.map((g, i) => {
                const changed = filters[g.key] !== NO_FILTERS[g.key];
                return (
                  <Pill key={g.key} focused={at("filters", i)}>
                    <span className="text-[13px] opacity-60">{g.label}:</span>
                    <span
                      className={
                        changed && !at("filters", i) ? "text-accent" : ""
                      }
                    >
                      {valueOf(g)}
                    </span>
                  </Pill>
                );
              })}
              {filtered ? (
                <Pill focused={at("filters", groups.length)}>Скинути</Pill>
              ) : null}
            </div>
            {openGroup ? (
              <div className="tv-rise mt-2 bg-black/70 py-2">
                <div className="-mx-0 overflow-hidden">
                  <OptionRail
                    options={openGroup.options}
                    current={filters[openGroup.key]}
                    at={at}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ),
      })}
    />
  );
}

/** The open filter's choices, the chosen one in the accent colour. */
function OptionRail({
  options,
  current,
  at,
}: {
  options: Array<{ id: string; label: string }>;
  current: string;
  at: (lane: string, i: number) => boolean;
}) {
  const col = Math.max(
    0,
    options.findIndex((_, i) => at("options", i)),
  );
  // Long lists (genres) slide so the focused choice stays in view.
  const shift = Math.max(0, col - 4) * 150;
  return (
    <div
      data-lane="options"
      className="flex gap-2 px-12 transition-transform duration-200"
      style={{ transform: `translate3d(${-shift}px,0,0)` }}
    >
      {options.map((o, i) => (
        <Pill key={o.id} focused={at("options", i)} accent={o.id === current}>
          {o.label}
        </Pill>
      ))}
    </div>
  );
}

/** A person: films and series as rows, most known first. */
export function TvPerson() {
  const { id = "" } = useParams();
  const person = useAsync(() => tmdb.person(Number(id)), [id]);
  const credits = [
    ...(person.data?.combined_credits?.cast ?? []),
    ...(person.data?.combined_credits?.crew ?? []),
  ];
  const of = (type: MediaType) =>
    cardsOf(byCatalogRank(credits.filter((c) => c.media_type === type)), type);
  const rows: CardRow[] = useMemo(
    () => [
      { key: "movies", title: "Фільми", cards: of("movie") },
      { key: "shows", title: "Серіали", cards: of("tv") },
    ],
    [person.data],
  );
  return (
    <RowsScreen
      tab={null}
      rows={rows}
      heading={
        person.data ? (
          <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.16em] text-accent">
            {person.data.name} · фільмографія
          </p>
        ) : null
      }
      empty={person.error ? "Не вдалося завантажити фільмографію." : "Завантажую…"}
    />
  );
}
