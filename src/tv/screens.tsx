import { useMemo } from "react";
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

const recent = (a: LibraryItem, b: LibraryItem) => b.updatedAt - a.updatedAt;

function useFeed(id: FeedId, seed?: { type: MediaType; id: number }) {
  return useAsync(() => loadFeedPage(id, 1, seed), [id, seed?.type, seed?.id]);
}

const feedRow = (id: FeedId, data: { results: TmdbItem[] } | null): CardRow => {
  const meta = FEEDS.find((f) => f.id === id)!;
  return {
    key: id,
    title: meta.title,
    cards: cardsOf(data?.results ?? [], meta.type),
  };
};

/** Лента: what you are watching and want to watch first, then the catalog. */
export function TvHome() {
  const { items } = useAppState();
  const seed = tasteSeed(items);
  const watchingKey = items
    .filter((x) => x.type === "tv" && x.status === "watching")
    .map((x) => x.id)
    .join();
  const shows = useAsync(() => loadWatchingShows(items), [watchingKey]);
  const theaters = useFeed("theaters");
  const trending = useFeed("trending");
  const airing = useFeed("airing");
  const upcoming = useFeed("upcoming");
  const upcomingTv = useFeed("upcoming-tv");
  const topMovies = useFeed("imdb250-movie");
  const topTv = useFeed("imdb250-tv");
  const recs = useAsync(
    () =>
      seed
        ? loadFeedPage("recs", 1, { type: seed.type, id: seed.id })
        : Promise.resolve(null),
    [seed?.type, seed?.id],
  );

  // Rows are rebuilt only when their data changes: posters skip re-rendering.
  const rows: CardRow[] = useMemo(
    () => [
      {
        key: "continue",
        title: "Продолжить смотреть",
        cards: continueWatching(items, shows.data ?? {}).map((c) =>
          fromLibrary(c.item, c.next ? episodeLabel(c.next) : undefined),
        ),
      },
      {
        key: "watchlist",
        title: "Хочу посмотреть",
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
    ],
    [
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
    ],
  );
  const failed = [theaters, trending].every((x) => x.error);
  return (
    <RowsScreen
      tab="/"
      rows={rows}
      empty={
        failed ? "Каталог сейчас не отвечает. Проверь интернет." : "Загружаю…"
      }
    />
  );
}

/** Коллекция: the library as rows by status. */
export function TvCollection() {
  const { items } = useAppState();
  const by = (status: LibraryItem["status"]) =>
    items.filter((x) => x.status === status).sort(recent);
  const rows: CardRow[] = useMemo(
    () => [
      {
        key: "watching",
        title: "Смотрю",
        cards: by("watching").map((x) =>
          fromLibrary(
            x,
            x.season && x.episode ? `S${x.season}E${x.episode}` : undefined,
          ),
        ),
      },
      {
        key: "watchlist",
        title: "Хочу посмотреть",
        cards: by("watchlist").map((x) => fromLibrary(x)),
      },
      {
        key: "watched",
        title: "Просмотрено",
        cards: by("watched").map((x) =>
          fromLibrary(x, x.rating ? `★ ${x.rating}` : undefined),
        ),
      },
      {
        key: "dropped",
        title: "Брошено",
        cards: by("dropped").map((x) => fromLibrary(x)),
      },
    ],
    [items],
  );
  return (
    <RowsScreen
      tab="/library"
      rows={rows}
      empty="Коллекция пока пуста. Открой фильм и нажми «Хочу посмотреть»."
    />
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
      { key: "movies", title: "Фильмы", cards: of("movie") },
      { key: "shows", title: "Сериалы", cards: of("tv") },
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
            {person.data.name} · фильмография
          </p>
        ) : null
      }
      empty={person.error ? "Не удалось загрузить фильмографию." : "Загружаю…"}
    />
  );
}
