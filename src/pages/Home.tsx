import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Row,
  ErrorBox,
  RatingBadge,
  hasWarmCache,
  useAsync,
} from "../components";
import { useMarkStartupReady } from "../components/RequireAccount";
import {
  loadNewEpisodes,
  pickSpotlight,
  tasteSeed,
  type Spotlight,
} from "../lib/spotlight";
import { loadFeedPage, FEEDS } from "../lib/feeds";
import { useAppState, type LibraryItem } from "../state";
import { isTv } from "../lib/tvMode";
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
    `home:spot:${media}:${item.id}`,
  );
  const videos = details.data?.videos?.results ?? [];
  const trailer =
    videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    videos.find((v) => v.site === "YouTube");
  const title =
    item.title || item.name ? titleOf(item) : titleOf(details.data || item);
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
          decoding="async"
          fetchPriority="high"
          className="aspect-[4/3] w-full object-cover sm:aspect-[21/9] tv:aspect-[16/5]"
        />
      ) : (
        <div className="aspect-[4/3] sm:aspect-[21/9] tv:aspect-[16/5]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />
      <Link
        to={`/title/${media}/${item.id}`}
        aria-label={title}
        // On TV the card's buttons get focus; "Подробнее" opens the title.
        tabIndex={isTv ? -1 : undefined}
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
        <div className="pointer-events-auto mt-3 flex min-h-9 flex-wrap gap-2">
          {isTv ? (
            <Link
              to={`/title/${media}/${item.id}`}
              className={`${action} bg-accent text-black`}
            >
              Подробнее
            </Link>
          ) : null}
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
      data-tv-wait
      className="mb-10 aspect-[4/3] animate-pulse rounded-2xl border border-hairline bg-card sm:aspect-[21/9] tv:aspect-[16/5]"
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
          {kind === "season"
            ? `сезон ${season} · `
            : kind === "return"
              ? `сезон ${season}, продолжение · `
              : ""}
          {whenLabel(date)}
        </p>
      </div>
    </Link>
  );
}

function WatchlistReleases({
  list,
  animate = true,
}: {
  list: Release[];
  animate?: boolean;
}) {
  if (!list.length) return null;
  return (
    <section className={`${animate ? "rise " : ""}mb-10`}>
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

function ContinueRow({
  rows,
  pendingCount = 0,
  animate = true,
}: {
  rows: ContinueItem[];
  pendingCount?: number;
  animate?: boolean;
}) {
  if (!rows.length) {
    if (!pendingCount) return null;
    return (
      <section aria-hidden="true" data-tv-wait className="mb-10">
        <div className="mb-3 h-7 w-52 animate-pulse rounded-lg bg-card" />
        <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: Math.min(pendingCount, 6) }, (_, idx) => (
            <div key={idx} className="w-[42vw] shrink-0 sm:w-40">
              <div className="aspect-[2/3] w-full animate-pulse rounded-xl border border-hairline bg-card" />
              <div className="mt-2 space-y-1">
                <div className="h-4 w-4/5 animate-pulse rounded bg-card" />
                <div className="h-3.5 w-1/2 animate-pulse rounded bg-card" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className={`${animate ? "rise " : ""}mb-10`}>
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
  const { uid, libraryReady, items, settings } = useAppState();
  const markStartupReady = useMarkStartupReady();
  const [warmOnMount] = useState(
    () => hasWarmCache("home:theaters") || hasWarmCache("home:trending"),
  );
  const animate = !warmOnMount;

  const seed = tasteSeed(items);
  const watchlistItems = items.filter((x) => x.status === "watchlist");
  const watchlistKey = watchlistItems.map((x) => `${x.type}-${x.id}`).join();
  const showsKey = items
    .filter((x) => x.type === "tv" && x.status !== "watchlist")
    .map((x) => `${x.id}-${x.status}`)
    .join();
  const watchingItems: LibraryItem[] = items.filter(
    (x) => x.type === "tv" && x.status === "watching",
  );
  const watchingKey = watchingItems.map((x) => x.id).join();

  // Enqueue primary above-the-fold catalog feeds first.
  const theaters = useAsync(
    () => loadFeedPage("theaters", 1),
    [],
    "home:theaters",
  );
  const trending = useAsync(
    () => loadFeedPage("trending", 1),
    [],
    "home:trending",
  );
  const recs = useAsync(
    () =>
      loadFeedPage(
        "recs",
        1,
        seed ? { type: seed.type, id: seed.id } : undefined,
      ),
    [seed?.id, seed?.type],
    `home:recs:${seed?.type ?? ""}:${seed?.id ?? ""}`,
  );
  const airing = useAsync(() => loadFeedPage("airing", 1), [], "home:airing");

  // Personal shelf enrichments (cached across reloads in localStorage).
  const watchingShows = useAsync(
    () => loadWatchingShows(items),
    [watchingKey],
    `home:watching:${uid ?? ""}:${watchingKey}`,
  );
  const releases = useAsync(
    () => loadWatchlistReleases(watchlistItems, settings.region),
    [watchlistKey, settings.region],
    `home:releases:${uid ?? ""}:${settings.region}:${watchlistKey}`,
  );
  const episodes = useAsync(
    () => loadNewEpisodes(items),
    [showsKey],
    `home:episodes:${uid ?? ""}:${showsKey}`,
  );

  // Below-the-fold feeds.
  const upcoming = useAsync(
    () => loadFeedPage("upcoming", 1),
    [],
    "home:upcoming",
  );
  const upcomingTv = useAsync(
    () => loadFeedPage("upcoming-tv", 1),
    [],
    "home:upcoming-tv",
  );
  const imdbMovies = useAsync(
    () => loadFeedPage("imdb250-movie", 1),
    [],
    "home:imdb-movie",
  );
  const imdbTv = useAsync(
    () => loadFeedPage("imdb250-tv", 1),
    [],
    "home:imdb-tv",
  );

  const firstError = [theaters, trending].find((x) => x.error)?.error;
  const spotlightPending =
    !libraryReady ||
    releases.loading ||
    episodes.loading ||
    (seed ? recs.loading : trending.loading);

  const topCatalogReady =
    !theaters.loading || !trending.loading || Boolean(firstError);
  const homeReady =
    libraryReady &&
    !spotlightPending &&
    !watchingShows.loading &&
    topCatalogReady;

  useEffect(() => {
    if (homeReady) markStartupReady();
  }, [homeReady, markStartupReady]);

  if (firstError && !theaters.data && !trending.data)
    return <ErrorBox code={firstError} />;

  const watchlist: TmdbItem[] = watchlistItems.map((x) => ({
    id: x.id,
    title: x.type === "movie" ? x.title : undefined,
    name: x.type === "tv" ? x.title : undefined,
    poster_path: posterPathFromStored(x.poster),
    media_type: x.type,
    release_date: x.year,
  }));

  const preview = (id: (typeof FEEDS)[number]["id"]) =>
    FEEDS.find((f) => f.id === id)!;
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
  const shown = (list: TmdbItem[], fallbackType?: MediaType) =>
    spotlight
      ? list.filter(
          (x) =>
            !(
              x.id === spotlight.item.id &&
              (x.media_type || fallbackType || spotlight.media) ===
                spotlight.media
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
    <div className={`${animate ? "rise " : ""}space-y-2`}>
      {spotlight ? (
        <Featured spotlight={spotlight} />
      ) : spotlightPending ? (
        <FeaturedPlaceholder />
      ) : null}
      <TonightEntry />
      <WatchlistReleases list={releaseList} animate={animate} />
      <ContinueRow
        rows={continueWatching(items, watchingShows.data ?? {})}
        pendingCount={watchingShows.loading ? watchingItems.length : 0}
        animate={animate}
      />
      <Row
        title={preview("theaters").title}
        items={shown(theaters.data?.results ?? [], "movie")}
        loading={theaters.loading}
        animate={animate}
        type="movie"
        to="/feed/theaters"
      />
      <Row
        title={preview("trending").title}
        items={shown(trending.data?.results ?? [])}
        loading={trending.loading}
        animate={animate}
        to="/feed/trending"
      />
      <Row
        title={preview("airing").title}
        items={shown(airing.data?.results ?? [], "tv")}
        loading={airing.loading}
        animate={animate}
        type="tv"
        to="/feed/airing"
      />
      <Row
        title={preview("upcoming").title}
        items={shown(upcoming.data?.results ?? [], "movie")}
        loading={upcoming.loading}
        animate={animate}
        type="movie"
        to="/feed/upcoming"
      />
      <Row
        title={preview("upcoming-tv").title}
        items={shown(upcomingTv.data?.results ?? [], "tv")}
        loading={upcomingTv.loading}
        animate={animate}
        type="tv"
        to="/feed/upcoming-tv"
      />
      <Row
        title={preview("watchlist").title}
        items={watchlist}
        animate={animate}
      />
      <Row
        title={preview("imdb250-movie").title}
        items={shown(imdbMovies.data?.results ?? [], "movie")}
        loading={imdbMovies.loading}
        animate={animate}
        type="movie"
        to="/feed/imdb250-movie"
      />
      <Row
        title={preview("imdb250-tv").title}
        items={shown(imdbTv.data?.results ?? [], "tv")}
        loading={imdbTv.loading}
        animate={animate}
        type="tv"
        to="/feed/imdb250-tv"
      />
      <Row
        title={preview("recs").title}
        items={shown(recs.data?.results ?? [], seed?.type as MediaType | undefined)}
        loading={recs.loading}
        animate={animate}
        type={seed?.type as MediaType | undefined}
        to="/feed/recs"
      />
    </div>
  );
}
