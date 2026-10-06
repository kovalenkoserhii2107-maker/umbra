import { Link } from "react-router-dom";
import { Row, ErrorBox, RatingBadge, useAsync } from "../components";
import {
  loadNewEpisodes,
  pickSpotlight,
  tasteSeed,
  type Spotlight,
} from "../lib/spotlight";
import { loadFeedPage, FEEDS } from "../lib/feeds";
import { useAppState } from "../state";
import {
  continueWatching,
  episodeLabel,
  loadWatchingShows,
  type ContinueItem,
} from "../lib/tracking";
import { dayMonthLabel, plural, yearOf } from "../lib/format";
import {
  daysUntil,
  loadWatchlistReleases,
  localIso,
  type Release,
} from "../lib/releases";
import {
  backdropUrl,
  correctPosterUrl,
  posterUrl,
  titleOf,
  tmdb,
  type MediaType,
  type TmdbItem,
} from "../lib/tmdb";

function posterPathFromStored(url: string) {
  const match = url.match(/\/t\/p\/w\d+(\/.+)$/);
  return match ? match[1] : null;
}

/** Entry to the evening picker, right under the spotlight. */
function TonightEntry() {
  return (
    <Link
      to="/tonight"
      className="mb-8 mt-4 flex items-center justify-between gap-4 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/15 to-transparent px-4 py-4 hover:border-accent"
    >
      <span className="min-w-0">
        <span className="block text-lg tracking-tight">
          Что посмотреть вечером?
        </span>
        <span className="block text-sm text-mute">
          4 вопроса — и подборка под настроение по твоим оценкам
        </span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-2xl text-accent">
        →
      </span>
    </Link>
  );
}

function Featured({ spotlight }: { spotlight: Spotlight }) {
  const { item, media, kicker, note } = spotlight;
  const { get, upsert } = useAppState();
  const mine = get(media, item.id);
  const details = useAsync(
    () => tmdb.details(media, item.id),
    [media, item.id],
  );
  const videos = details.data?.videos?.results ?? [];
  const trailer =
    videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    videos.find((v) => v.site === "YouTube");
  const title = titleOf(details.data || item);
  const bg =
    backdropUrl(item.backdrop_path) || backdropUrl(item.poster_path, "w780");
  function want() {
    upsert({
      id: item.id,
      type: media,
      title,
      poster: posterUrl(item.poster_path, "w185"),
      year: yearOf(item.release_date || item.first_air_date),
      status: "watchlist",
      rating: null,
      note: "",
    });
  }
  const action =
    "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium";
  return (
    <section className="relative mb-10 overflow-hidden rounded-2xl border border-hairline bg-card">
      {bg ? (
        <img
          src={bg}
          alt=""
          className="aspect-[4/3] w-full object-cover sm:aspect-[21/9]"
        />
      ) : (
        <div className="aspect-[4/3] sm:aspect-[21/9]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />
      <Link
        to={`/title/${media}/${item.id}`}
        aria-label={title}
        className="absolute inset-0"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
          {kicker}
        </p>
        <h2 className="mt-1 text-2xl tracking-tight text-white sm:text-3xl">
          {title}
        </h2>
        {note ? <p className="mt-1 text-sm text-white/70">{note}</p> : null}
        <div className="pointer-events-auto mt-3 flex flex-wrap gap-2">
          {mine ? null : (
            <button
              type="button"
              onClick={want}
              className={`${action} bg-ink text-canvas`}
            >
              <span aria-hidden="true">+</span> Хочу посмотреть
            </button>
          )}
          {trailer ? (
            <a
              href={`https://www.youtube.com/watch?v=${trailer.key}`}
              target="_blank"
              rel="noreferrer"
              className={`${action} border border-white/25 bg-black/40 text-white backdrop-blur-sm`}
            >
              <span aria-hidden="true">▶</span> Трейлер
            </a>
          ) : null}
        </div>
      </div>
      <RatingBadge type={media} id={item.id} />
    </section>
  );
}

function FeaturedPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="mb-10 aspect-[4/3] animate-pulse rounded-2xl border border-hairline bg-card sm:aspect-[21/9]"
    />
  );
}

function whenLabel(date: string) {
  const days = daysUntil(date, localIso(new Date()));
  if (days === 0) return "выход сегодня";
  if (days === 1) return "выход завтра";
  if (days === -1) return "вышел вчера";
  const n = Math.abs(days);
  const span = `${n} ${plural(n, "день", "дня", "дней")}`;
  return days > 0 ? `выход через ${span}` : `вышел ${span} назад`;
}

function ReleaseCard({ release }: { release: Release }) {
  const { item, date, kind, season } = release;
  const upcoming = daysUntil(date, localIso(new Date())) >= 0;
  return (
    <Link
      to={`/title/${item.type}/${item.id}`}
      className="group block w-[42vw] shrink-0 sm:w-40"
    >
      <div className="poster-hover relative overflow-hidden rounded-xl border border-hairline bg-card">
        {item.poster ? (
          <img
            src={correctPosterUrl(item.poster)}
            alt={item.title}
            className="aspect-[2/3] w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-[2/3] items-end p-3 text-sm text-mute">
            {item.title}
          </div>
        )}
        <p
          className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-1 font-mono text-[11px] font-bold leading-none ${upcoming ? "bg-accent text-black" : "bg-black/75 text-accent backdrop-blur-sm"}`}
        >
          {dayMonthLabel(date)}
        </p>
        <RatingBadge type={item.type} id={item.id} />
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="line-clamp-2 text-sm leading-snug">{item.title}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
          {kind === "season" ? `сезон ${season} · ` : ""}
          {whenLabel(date)}
        </p>
      </div>
    </Link>
  );
}

function WatchlistReleases({ list }: { list: Release[] }) {
  if (!list.length) return null;
  return (
    <section className="rise mb-10">
      <div className="mb-3">
        <h2 className="text-lg font-medium tracking-tight">
          Релизы из «Хочу посмотреть»
        </h2>
        <p className="mt-0.5 text-xs text-mute">
          Выходят в ближайшую неделю или вышли за последнюю
        </p>
      </div>
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {list.map((release) => (
          <ReleaseCard
            key={`${release.item.type}-${release.item.id}`}
            release={release}
          />
        ))}
      </div>
    </section>
  );
}

function ContinueCard({ row }: { row: ContinueItem }) {
  const { update } = useAppState();
  const { item, next, available, date } = row;
  return (
    <div className="w-[42vw] shrink-0 sm:w-40">
      <Link to={`/title/tv/${item.id}`} className="group block">
        <div className="poster-hover relative overflow-hidden rounded-xl border border-hairline bg-card">
          {item.poster ? (
            <img
              src={correctPosterUrl(item.poster)}
              alt={item.title}
              className="aspect-[2/3] w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex aspect-[2/3] items-end p-3 text-sm text-mute">
              {item.title}
            </div>
          )}
          {next ? (
            <p
              className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-1 font-mono text-[11px] font-bold leading-none ${available ? "bg-accent text-black" : "bg-black/75 text-accent backdrop-blur-sm"}`}
            >
              {episodeLabel(next)}
            </p>
          ) : null}
        </div>
        <p className="mt-2 line-clamp-1 text-sm leading-snug">{item.title}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
          {available
            ? "следующая серия"
            : date
              ? `ждём · ${dayMonthLabel(date)}`
              : "новых серий нет"}
        </p>
      </Link>
      {available && next ? (
        <button
          type="button"
          onClick={() => update("tv", item.id, next)}
          className="mt-2 w-full rounded-full border border-hairline py-1.5 text-xs text-mute hover:border-accent hover:text-ink"
        >
          ✓ Просмотрено
        </button>
      ) : null}
    </div>
  );
}

function ContinueRow({ rows }: { rows: ContinueItem[] }) {
  if (!rows.length) return null;
  return (
    <section className="rise mb-10">
      <h2 className="mb-3 text-lg font-medium tracking-tight">
        Продолжить смотреть
      </h2>
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {rows.map((row) => (
          <ContinueCard key={row.item.id} row={row} />
        ))}
      </div>
    </section>
  );
}

export function HomePage() {
  const { items, settings, sync } = useAppState();
  const seed = tasteSeed(items);
  const watchlistItems = items.filter((x) => x.status === "watchlist");
  const watchlistKey = watchlistItems.map((x) => `${x.type}-${x.id}`).join();
  const showsKey = items
    .filter((x) => x.type === "tv" && x.status !== "watchlist")
    .map((x) => `${x.id}-${x.status}`)
    .join();
  const releases = useAsync(
    () => loadWatchlistReleases(watchlistItems, settings.region),
    [watchlistKey, settings.region],
  );
  const episodes = useAsync(() => loadNewEpisodes(items), [showsKey]);
  const watchingKey = items
    .filter((x) => x.type === "tv" && x.status === "watching")
    .map((x) => x.id)
    .join();
  const watchingShows = useAsync(() => loadWatchingShows(items), [watchingKey]);
  const theaters = useAsync(() => loadFeedPage("theaters", 1), []);
  const trending = useAsync(() => loadFeedPage("trending", 1), []);
  const airing = useAsync(() => loadFeedPage("airing", 1), []);
  const upcoming = useAsync(() => loadFeedPage("upcoming", 1), []);
  const upcomingTv = useAsync(() => loadFeedPage("upcoming-tv", 1), []);
  const imdbMovies = useAsync(() => loadFeedPage("imdb250-movie", 1), []);
  const imdbTv = useAsync(() => loadFeedPage("imdb250-tv", 1), []);
  const recs = useAsync(
    () =>
      loadFeedPage(
        "recs",
        1,
        seed ? { type: seed.type, id: seed.id } : undefined,
      ),
    [seed?.id, seed?.type],
  );

  const firstError = [theaters, trending].find((x) => x.error)?.error;
  if (firstError && !theaters.data && !trending.data)
    return <ErrorBox code={firstError} />;

  const watchlist: TmdbItem[] = items
    .filter((x) => x.status === "watchlist")
    .map((x) => ({
      id: x.id,
      title: x.type === "movie" ? x.title : undefined,
      name: x.type === "tv" ? x.title : undefined,
      poster_path: posterPathFromStored(x.poster),
      media_type: x.type,
      release_date: x.year,
    }));

  const preview = (id: (typeof FEEDS)[number]["id"]) =>
    FEEDS.find((f) => f.id === id)!;
  // Wait for the first library snapshot so the spotlight is chosen once.
  const libraryPending = sync === "connecting" && !items.length;
  const spotlightPending =
    libraryPending ||
    releases.loading ||
    episodes.loading ||
    (seed ? recs.loading : trending.loading);
  const spotlight = spotlightPending
    ? null
    : pickSpotlight({
        releases: releases.data ?? [],
        episodes: episodes.data ?? [],
        recommendations: seed ? (recs.data?.results ?? []) : [],
        popular: trending.data?.results ?? [],
        seed,
        library: items,
      });
  const shown = (list: TmdbItem[]) =>
    spotlight
      ? list.filter(
          (x) =>
            !(
              x.id === spotlight.item.id &&
              (x.media_type || spotlight.media) === spotlight.media
            ),
        )
      : list;
  const releaseList = (releases.data ?? []).filter(
    (r) =>
      !(
        spotlight?.reason === "release" &&
        r.item.id === spotlight.item.id &&
        r.item.type === spotlight.media
      ),
  );

  return (
    <div className="rise space-y-2">
      {spotlight ? (
        <Featured spotlight={spotlight} />
      ) : spotlightPending ? (
        <FeaturedPlaceholder />
      ) : null}
      <TonightEntry />
      <WatchlistReleases list={releaseList} />
      <ContinueRow rows={continueWatching(items, watchingShows.data ?? {})} />
      <Row
        title={preview("theaters").title}
        items={theaters.data?.results ?? []}
        type="movie"
        to="/feed/theaters"
      />
      <Row
        title={preview("trending").title}
        items={shown(trending.data?.results ?? [])}
        to="/feed/trending"
      />
      <Row
        title={preview("airing").title}
        items={airing.data?.results ?? []}
        type="tv"
        to="/feed/airing"
      />
      <Row
        title={preview("upcoming").title}
        items={upcoming.data?.results ?? []}
        type="movie"
        to="/feed/upcoming"
      />
      <Row
        title={preview("upcoming-tv").title}
        items={upcomingTv.data?.results ?? []}
        type="tv"
        to="/feed/upcoming-tv"
      />
      <Row title={preview("watchlist").title} items={watchlist} />
      <Row
        title={preview("imdb250-movie").title}
        items={imdbMovies.data?.results ?? []}
        type="movie"
        to="/feed/imdb250-movie"
      />
      <Row
        title={preview("imdb250-tv").title}
        items={imdbTv.data?.results ?? []}
        type="tv"
        to="/feed/imdb250-tv"
      />
      <Row
        title={preview("recs").title}
        items={shown(recs.data?.results ?? [])}
        type={seed?.type as MediaType | undefined}
        to="/feed/recs"
      />
    </div>
  );
}
