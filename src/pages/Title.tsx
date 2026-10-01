import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBox, PosterCard, useAsync } from "../components";
import {
  Aside,
  AwardsLine,
  CARD,
  Crew,
  Details,
  Franchise,
  Gallery,
  LinksRow,
  Reviews,
  Section,
  Videos,
  WatchOptions,
} from "../components/TitleDetails";
import { fetchOmdbInfo, type OmdbScores } from "../lib/omdb";
import {
  certification,
  crewRows,
  showTypeLabel,
  sortedVideos,
  statusLabel,
  votesShort,
} from "../lib/titleFacts";
import { CollectionMark } from "../components/CollectionMark";
import { ShareButton } from "../components/ShareButton";
import { useAuth } from "../lib/auth";
import { loadFriendsOn, useFriendList } from "../lib/friends";
import { Avatar, byInterest, sharedStatus } from "../components/FriendsIndex";
import { Seasons } from "../components/Seasons";
import {
  backdropUrl,
  kindOf,
  posterUrl,
  titleOf,
  tmdb,
  type MediaType,
  type PersonRef,
  type TitleDetails,
  type TmdbItem,
} from "../lib/tmdb";
import {
  fetchCriticScores,
  fetchImdbRating,
  rememberRating,
  type CriticScores,
} from "../lib/ratings";
import { dateLabel, runtimeLabel, yearOf } from "../lib/format";
import { byCatalogRank } from "../lib/rank";
import { localIso } from "../lib/releases";
import { useAppState } from "../state";
import { progressOf, type Episode } from "../lib/tracking";
import type { EpisodeRef, SeasonInfo } from "../lib/tv";

function tomatoColor(score: number) {
  return score >= 60 ? "#fa320a" : "#0ac855";
}

function metascoreColor(score: number) {
  if (score >= 61) return "#66cc33";
  if (score >= 40) return "#ffcc33";
  return "#ff4d4d";
}

function rottenTomatoesUrl(critics: CriticScores | null, title: string) {
  if (critics?.rottenTomatoesId)
    return `https://www.rottentomatoes.com/${critics.rottenTomatoesId}`;
  return `https://www.rottentomatoes.com/search?search=${encodeURIComponent(title)}`;
}

type Tile = {
  label: string;
  title: string;
  /** undefined while the source is still loading. */
  value: string | null | undefined;
  sub?: string | null;
  color: string;
  href?: string;
};

/** One row of equal tiles; a source without a score is left out. */
function RatingsStrip({ tiles }: { tiles: Tile[] }) {
  const shown = tiles.filter((t) => t.value !== null);
  if (!shown.length) return null;
  return (
    <div className="mt-4 flex gap-2">
      {shown.map((t) => {
        const body = (
          <>
            <span className="truncate text-[11px] font-medium text-mute">
              {t.label}
            </span>
            {t.value === undefined ? (
              <span className="mt-1.5 block h-6 w-10 animate-pulse rounded bg-hairline" />
            ) : (
              <span
                className="mt-1 font-mono text-xl font-bold leading-6"
                style={{ color: t.color }}
              >
                {t.value}
              </span>
            )}
            <span className="mt-0.5 h-4 truncate font-mono text-[10px] text-dim">
              {t.value ? t.sub || "" : ""}
            </span>
          </>
        );
        const className = `${CARD} flex min-w-0 flex-1 flex-col px-2.5 py-2.5 sm:px-3`;
        return t.href ? (
          <a
            key={t.label}
            href={t.href}
            target="_blank"
            rel="noreferrer"
            title={t.title}
            aria-label={`${t.title}: ${t.value ?? "загружается"}`}
            className={`${className} hover:border-accent`}
          >
            {body}
          </a>
        ) : (
          <div key={t.label} title={t.title} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

function FriendsOnTitle({ media, id }: { media: MediaType; id: number }) {
  const { account } = useAuth();
  const friends = useFriendList(account?.sub || null);
  const key = (friends.list ?? []).map((p) => p.uid).join();
  const rows = useAsync(
    () => loadFriendsOn(friends.list ?? [], media, id),
    [key, media, id],
  );
  const list = [...(rows.data ?? [])].sort(byInterest);
  if (!list.length) return null;
  const rated = list.filter((r) => r.rating.rating !== null);
  const average =
    rated.length > 1
      ? rated.reduce((s, r) => s + r.rating.rating!, 0) / rated.length
      : null;
  // Sits in the header next to the public ratings, where it is seen first.
  return (
    <div className="mt-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
        Оценки друзей
        {average !== null ? ` · средняя ${average.toFixed(1)}` : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {list.map(({ friend, rating }) => (
          <Link
            key={friend.uid}
            to={`/friends/${friend.uid}`}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-hairline bg-canvas/60 py-1 pl-1 pr-3 hover:border-accent"
          >
            <Avatar person={friend} size={24} />
            <span className="truncate text-sm">{friend.name}</span>
            <span
              className={`shrink-0 font-mono text-sm ${rating.rating ? "font-bold text-accent" : "text-mute"}`}
            >
              {sharedStatus(rating)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Long descriptions fold to five lines. */
function Overview({ text }: { text?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 320;
  return (
    <div className="mt-8 max-w-3xl">
      <p
        className={`text-[15px] leading-7 text-ink/90 ${long && !open ? "line-clamp-5" : ""}`}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-sm text-accent"
        >
          {open ? "Свернуть" : "Читать полностью"}
        </button>
      ) : null}
    </div>
  );
}

function PersonCard({ person, role }: { person: PersonRef; role: string }) {
  return (
    <Link to={`/person/${person.id}`} className="w-28 shrink-0">
      {person.profile_path ? (
        <img
          src={posterUrl(person.profile_path, "w185")}
          alt=""
          loading="lazy"
          className="aspect-[2/3] w-full rounded-xl border border-hairline object-cover"
        />
      ) : (
        <div className="flex aspect-[2/3] items-center justify-center rounded-xl border border-hairline bg-card text-2xl text-dim">
          {person.name.slice(0, 1)}
        </div>
      )}
      <p className="mt-1.5 line-clamp-2 text-sm leading-snug">{person.name}</p>
      <p className="line-clamp-1 font-mono text-[10px] text-dim">{role}</p>
    </Link>
  );
}

function PosterRow({
  title,
  items,
  media,
}: {
  title: string;
  items: TmdbItem[];
  media: MediaType;
}) {
  if (!items.length) return null;
  return (
    <Section title={title}>
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {byCatalogRank(items)
          .slice(0, 12)
          .map((s) => (
            <PosterCard
              key={s.id}
              item={s}
              type={kindOf({ ...s, media_type: media })}
            />
          ))}
      </div>
    </Section>
  );
}

/** "2019–2023" for finished shows, "2019 — н. в." for running ones. */
function years(item: TitleDetails, media: MediaType) {
  const first = yearOf(item.release_date || item.first_air_date);
  if (media !== "tv" || !first) return first;
  const last = yearOf((item as { last_air_date?: string }).last_air_date);
  if (item.in_production || item.status === "Returning Series")
    return `${first} — н. в.`;
  return last && last !== first ? `${first}–${last}` : first;
}

export function TitlePage() {
  const { type = "movie", id = "" } = useParams();
  const media = (type === "tv" ? "tv" : "movie") as MediaType;
  const { settings, get, update, upsert } = useAppState();
  const mine = get(media, Number(id));
  const query = useAsync(() => tmdb.details(media, Number(id)), [media, id]);
  const [imdb, setImdb] = useState<string | null | undefined>(undefined);
  const [critics, setCritics] = useState<CriticScores | null>(null);
  const [omdb, setOmdb] = useState<OmdbScores | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setImdb(undefined);
    setCritics(null);
    setOmdb(undefined);
    const item = query.data;
    if (!item || item.id !== Number(id)) return;
    const imdbId = item.external_ids?.imdb_id;
    if (!imdbId) {
      setImdb(null);
      setOmdb(null);
      return;
    }
    fetchImdbRating(imdbId)
      .then((value) => {
        if (!alive) return;
        setImdb(value);
        if (value) rememberRating(media, item.id, { imdb: value });
      })
      .catch(() => alive && setImdb(null));
    fetchCriticScores(imdbId).then((value) => {
      if (alive) setCritics(value);
    });
    fetchOmdbInfo(imdbId).then((value) => {
      if (alive) setOmdb(value);
    });
    return () => {
      alive = false;
    };
  }, [query.data, media, id]);

  if (query.error) return <ErrorBox code={query.error} />;
  if (query.loading || !query.data)
    return <p className="text-sm text-mute">Собираю карточку…</p>;

  const item = query.data as typeof query.data & {
    seasons?: SeasonInfo[];
    next_episode_to_air?: EpisodeRef | null;
    last_episode_to_air?: EpisodeRef | null;
  };
  const title = titleOf(item);
  const original = item.original_title || item.original_name;
  const released = item.release_date || item.first_air_date;
  const year = yearOf(released);
  const upcoming = released && released.slice(0, 10) > localIso(new Date());
  const runtime = item.runtime || item.episode_run_time?.[0];
  const rated = certification(item, media, settings.region);
  const status = statusLabel(item.status);
  const showType = media === "tv" ? showTypeLabel(item.type) : null;
  const imdbId = item.external_ids?.imdb_id || "";
  const region = item["watch/providers"]?.results[settings.region];
  const rtUrl = rottenTomatoesUrl(critics, original || title);
  const poster = posterUrl(item.poster_path, "w342");
  const criticsPending = Boolean(imdbId) && critics === null;

  function markEpisode(ep: Episode) {
    if (mine) {
      // Marking episodes means the show is being watched, unless it is finished.
      const status = mine.status === "watched" ? "watched" : "watching";
      update(media, item.id, { ...ep, status });
      return;
    }
    upsert({
      id: item.id,
      type: media,
      title,
      poster: posterUrl(item.poster_path, "w185"),
      year,
      status: "watching",
      rating: null,
      note: "",
      ...ep,
    });
  }

  const tiles: Tile[] = [
    {
      label: "IMDb",
      title: "Рейтинг IMDb",
      value:
        imdb || omdb?.imdbRating || (imdb === undefined ? undefined : null),
      sub: votesShort(omdb?.imdbVotes),
      color: "#f5c518",
      href: imdbId ? `https://www.imdb.com/title/${imdbId}/` : undefined,
    },
    {
      label: "TMDB",
      title: "Рейтинг TMDB",
      value:
        item.vote_count && item.vote_average
          ? item.vote_average.toFixed(1)
          : null,
      sub: votesShort(item.vote_count),
      color: "#01b4e4",
      href: `https://www.themoviedb.org/${media}/${item.id}`,
    },
    {
      label: "Tomatoes",
      title: "Rotten Tomatoes — доля положительных рецензий критиков",
      value: criticsPending
        ? undefined
        : critics?.tomatometer != null
          ? `${critics.tomatometer}%`
          : null,
      sub:
        critics?.tomatometer != null
          ? critics.tomatometer >= 60
            ? "свежий"
            : "гнилой"
          : null,
      color: tomatoColor(critics?.tomatometer ?? 100),
      href: rtUrl,
    },
    {
      label: "Metacritic",
      title: "Metascore — сводная оценка критиков",
      value: criticsPending
        ? undefined
        : critics?.metascore != null
          ? String(critics.metascore)
          : null,
      sub: critics?.metascore != null ? "критики" : null,
      color: metascoreColor(critics?.metascore ?? 0),
      href: imdbId
        ? `https://www.imdb.com/title/${imdbId}/criticreviews/`
        : undefined,
    },
  ];

  const meta = [
    runtime ? runtimeLabel(runtime) : null,
    item.number_of_seasons ? `${item.number_of_seasons} сез.` : null,
    item.number_of_episodes ? `${item.number_of_episodes} эп.` : null,
    showType,
  ].filter(Boolean);
  const recommendations = item.recommendations?.results ?? [];
  const similar = (item.similar?.results ?? []).filter(
    (s) => !recommendations.some((r) => r.id === s.id),
  );
  const cast = item.credits?.cast ?? [];

  return (
    <article className="rise pb-8">
      <header className={`${CARD} relative overflow-hidden rounded-3xl`}>
        <div
          className={`relative ${item.backdrop_path ? "h-52 sm:h-80" : poster ? "h-28 sm:h-36" : "h-16"}`}
        >
          {item.backdrop_path ? (
            <img
              src={backdropUrl(item.backdrop_path)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full bg-canvas-soft" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
          <div className="absolute right-3 top-3">
            <ShareButton
              title={title}
              path={`/title/${media}/${item.id}`}
              text={`«${title}»${year ? ` (${year})` : ""}${imdb ? ` — IMDb ${imdb}` : ""}. Смотри в Umbra:`}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-black/70"
            />
          </div>
        </div>
        <div
          className={`relative flex items-end gap-4 px-4 sm:px-6 ${item.backdrop_path ? "-mt-20 sm:-mt-28" : poster ? "-mt-16 sm:-mt-20" : "-mt-4"}`}
        >
          {poster ? (
            <img
              src={poster}
              alt=""
              className="w-24 shrink-0 rounded-xl border border-hairline shadow-[0_12px_30px_rgba(0,0,0,0.6)] sm:w-36"
            />
          ) : null}
          <div className="min-w-0 flex-1 pb-0.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              {media === "tv" ? "сериал" : "фильм"}
              {years(item, media) ? ` · ${years(item, media)}` : ""}
            </p>
            <h1 className="mt-1 text-2xl leading-tight tracking-tight sm:text-4xl">
              {title}
            </h1>
            {original && original !== title ? (
              <p className="mt-0.5 truncate text-sm text-dim">{original}</p>
            ) : null}
          </div>
        </div>
        <div className="px-4 pb-5 pt-4 sm:px-6">
          {item.tagline ? (
            <p className="text-sm italic text-mute">{item.tagline}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-mute">
            {rated ? (
              <span
                title={`Возрастной рейтинг · ${rated.country}`}
                className="rounded border border-mute/60 px-1.5 font-mono text-xs text-ink"
              >
                {rated.code}
              </span>
            ) : null}
            {meta.map((m, i) => (
              <span key={m} className="flex items-center gap-2">
                {i || rated ? <span className="text-dim">·</span> : null}
                {m}
              </span>
            ))}
            {upcoming ? (
              <span className="text-accent">
                {meta.length || rated ? "· " : ""}выходит {dateLabel(released)}
              </span>
            ) : status && (media === "tv" || item.status !== "Released") ? (
              <span className="text-accent">
                {meta.length || rated ? "· " : ""}
                {status}
              </span>
            ) : null}
          </div>
          {item.genres?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.genres.map((g) => (
                <span
                  key={g.id}
                  className="rounded-full border border-hairline px-2.5 py-1 text-xs text-mute"
                >
                  {g.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <RatingsStrip tiles={tiles} />
      <FriendsOnTitle media={media} id={item.id} />

      <CollectionMark
        media={media}
        id={Number(id)}
        title={title}
        poster={posterUrl(item.poster_path, "w185")}
        year={year}
      />

      <Overview text={item.overview} />
      <AwardsLine omdb={omdb ?? null} />

      {media === "tv" ? (
        <Seasons
          // Remount once the show is tracked so it opens on the next episode.
          key={mine ? "tracked" : "new"}
          tvId={item.id}
          seasons={item.seasons}
          nextEpisode={item.next_episode_to_air}
          lastEpisode={item.last_episode_to_air}
          progress={progressOf(mine)}
          onMark={markEpisode}
        />
      ) : null}

      <WatchOptions region={region} regionCode={settings.region} />
      <Videos videos={sortedVideos(item.videos?.results)} />
      <Gallery item={item} />

      {cast.length ? (
        <Section
          title="В ролях"
          aside={cast.length > 16 ? <Aside>{cast.length} актёров</Aside> : null}
        >
          <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
            {cast.slice(0, 16).map((c) => (
              <PersonCard key={c.id} person={c} role={c.character || "роль"} />
            ))}
          </div>
        </Section>
      ) : null}
      <Crew rows={crewRows(item)} />
      <Details
        item={item}
        media={media}
        omdb={omdb ?? null}
        region={settings.region}
      />
      <Reviews
        media={media}
        id={item.id}
        imdbId={imdbId}
        rottenTomatoesUrl={rtUrl}
      />
      <Franchise item={item} currentId={item.id} />
      <PosterRow title="Рекомендации" items={recommendations} media={media} />
      <PosterRow title="Похожее" items={similar} media={media} />
      <LinksRow item={item} media={media} />
    </article>
  );
}
