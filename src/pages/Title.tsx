import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBox, PosterCard, useAsync } from "../components";
import {
  AwardsLine,
  CrewList,
  Facts,
  Franchise,
  Gallery,
  LinksRow,
  ReleaseDates,
  Reviews,
  Section,
  Videos,
  WatchOptions,
} from "../components/TitleDetails";
import { fetchOmdbInfo, type OmdbScores } from "../lib/omdb";
import {
  certification,
  extraCrew,
  showTypeLabel,
  sortedVideos,
  statusLabel,
  votesLabel,
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
} from "../lib/tmdb";
import {
  fetchCriticScores,
  fetchImdbRating,
  rememberRating,
  type CriticScores,
} from "../lib/ratings";
import { dateLabel, runtimeLabel, yearOf } from "../lib/format";
import { byCatalogRank } from "../lib/rank";
import { useAppState } from "../state";
import { progressOf, type Episode } from "../lib/tracking";
import type { EpisodeRef, SeasonInfo } from "../lib/tv";

const PRODUCER_JOBS = new Set(["Producer", "Executive Producer"]);
const WRITER_JOBS = new Set([
  "Writer",
  "Screenplay",
  "Story",
  "Teleplay",
  "Series Composition",
]);

function uniquePeople(list: PersonRef[]) {
  const seen = new Set<number>();
  return list.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function PersonCard({ person, role }: { person: PersonRef; role: string }) {
  return (
    <Link to={`/person/${person.id}`} className="w-28 shrink-0">
      {person.profile_path ? (
        <img
          src={posterUrl(person.profile_path, "w185")}
          alt=""
          className="aspect-[2/3] w-full rounded-xl object-cover"
        />
      ) : (
        <div className="aspect-[2/3] rounded-xl border border-hairline bg-card" />
      )}
      <p className="mt-1 line-clamp-2 text-sm">{person.name}</p>
      <p className="line-clamp-1 font-mono text-[10px] text-dim">{role}</p>
    </Link>
  );
}

function CrewColumn({
  title,
  people,
  role,
}: {
  title: string;
  people: PersonRef[];
  role: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <h2 className="text-lg tracking-tight">{title}</h2>
      <div className="row-scroll mt-3 flex gap-3 overflow-x-auto pb-2">
        {people.length ? (
          people
            .slice(0, 6)
            .map((p) => (
              <PersonCard key={`${role}-${p.id}`} person={p} role={role} />
            ))
        ) : (
          <p className="text-sm text-mute">Не указан</p>
        )}
      </div>
    </div>
  );
}

function ScorePill({
  label,
  value,
  color,
  href,
  hint,
}: {
  label: string;
  /** undefined while loading, null when the source has no score. */
  value: string | null | undefined;
  color: string;
  href?: string;
  /** Small note after the value, e.g. the number of votes. */
  hint?: string | null;
}) {
  const body = (
    <>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
        {label}
      </span>
      <span
        className="font-mono text-base font-bold leading-none"
        style={{ color: value ? color : undefined }}
      >
        {value === undefined ? "…" : value || "—"}
      </span>
      {value && hint ? (
        <span className="font-mono text-[10px] text-dim">{hint}</span>
      ) : null}
    </>
  );
  const className =
    "inline-flex items-center gap-2 rounded-full border border-hairline bg-canvas/60 px-3 py-1.5";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <span className={className}>{body}</span>
  );
}

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

function CriticReviews({
  imdbId,
  critics,
  title,
}: {
  imdbId: string;
  critics: CriticScores | null;
  title: string;
}) {
  const metascore = critics?.metascore ?? null;
  const tomatometer = critics?.tomatometer ?? null;
  return (
    <section className="mt-8">
      <h2 className="text-lg tracking-tight">Отзывы критиков</h2>
      <div className="mt-3 rounded-2xl border border-hairline bg-card p-4 sm:p-5">
        {!critics ? (
          <p className="text-sm text-mute">Собираю оценки критиков…</p>
        ) : metascore === null && tomatometer === null ? (
          <p className="text-sm text-mute">
            Сводные оценки критиков для этого тайтла пока не опубликованы.
          </p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {metascore !== null ? (
              <div className="flex items-center gap-3">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-lg font-mono text-lg font-bold text-black"
                  style={{ background: metascoreColor(metascore) }}
                >
                  {metascore}
                </span>
                <div>
                  <p className="text-sm">Metascore</p>
                  <p className="text-xs text-mute">
                    сводка рецензий критиков на IMDb
                  </p>
                </div>
              </div>
            ) : null}
            {tomatometer !== null ? (
              <div className="flex items-center gap-3">
                <span
                  className="flex h-12 min-w-12 items-center justify-center rounded-lg px-1.5 font-mono text-lg font-bold text-white"
                  style={{ background: tomatoColor(tomatometer) }}
                >
                  {tomatometer}%
                </span>
                <div>
                  <p className="text-sm">Tomatometer</p>
                  <p className="text-xs text-mute">
                    {tomatometer >= 60 ? "свежий" : "гнилой"} · доля
                    положительных рецензий
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`https://www.imdb.com/title/${imdbId}/criticreviews/`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs text-ink hover:border-accent"
          >
            Все рецензии критиков на IMDb
            <span className="text-accent">↗</span>
          </a>
          <a
            href={rottenTomatoesUrl(critics, title)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs text-mute hover:text-ink"
          >
            Rotten Tomatoes
            <span className="text-accent">↗</span>
          </a>
        </div>
      </div>
    </section>
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
    <div className="mt-3">
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

export function TitlePage() {
  const { type = "movie", id = "" } = useParams();
  const media = (type === "tv" ? "tv" : "movie") as MediaType;
  const { settings, get, update, upsert } = useAppState();
  const mine = get(media, Number(id));
  const query = useAsync(() => tmdb.details(media, Number(id)), [media, id]);
  const [imdb, setImdb] = useState<string | null | undefined>(undefined);
  const [critics, setCritics] = useState<CriticScores | null>(null);
  const [omdb, setOmdb] = useState<OmdbScores | null>(null);

  useEffect(() => {
    let alive = true;
    setImdb(undefined);
    setCritics(null);
    setOmdb(null);
    const item = query.data;
    if (!item || item.id !== Number(id)) return;
    const imdbId = item.external_ids?.imdb_id;
    if (!imdbId) {
      setImdb(null);
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
  const released = item.release_date || item.first_air_date;
  const year = yearOf(released);
  const releasedOn = dateLabel(released);
  const runtime = item.runtime || item.episode_run_time?.[0];
  const videos = sortedVideos(item.videos?.results);
  const rated = certification(item, media, settings.region);
  const status = statusLabel(item.status);
  const crew = item.credits?.crew || [];
  const directors = uniquePeople([
    ...crew.filter((c) => c.job === "Director"),
    ...(item.created_by || []),
  ]);
  const producers = uniquePeople(
    crew.filter((c) => c.job && PRODUCER_JOBS.has(c.job)),
  );
  const writers = uniquePeople(
    crew.filter((c) => c.job && WRITER_JOBS.has(c.job)),
  );
  const region = item["watch/providers"]?.results[settings.region];
  const original = item.original_title || item.original_name;
  const imdbId = item.external_ids?.imdb_id || "";
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
  const tmdbScore =
    item.vote_count && item.vote_average ? item.vote_average.toFixed(1) : null;

  return (
    <article className="rise pb-8">
      <div className="mb-6 overflow-hidden rounded-3xl border border-hairline bg-card">
        {item.backdrop_path ? (
          <img
            src={backdropUrl(item.backdrop_path)}
            alt=""
            className="h-44 w-full object-cover sm:h-64"
          />
        ) : (
          <div className="h-28 bg-canvas sm:h-40" />
        )}
        <div className="p-4 sm:p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
            {media === "tv" ? "сериал" : "фильм"}
            {releasedOn
              ? ` · ${media === "tv" ? "премьера" : "выход"} ${releasedOn}`
              : ""}
          </p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <h1 className="text-2xl tracking-tight sm:text-4xl">{title}</h1>
            <ShareButton
              title={title}
              path={`/title/${media}/${item.id}`}
              text={`«${title}»${year ? ` (${year})` : ""}${imdb ? ` — IMDb ${imdb}` : ""}. Смотри в Umbra:`}
            />
          </div>
          {original && original !== title ? (
            <p className="mt-0.5 text-sm text-dim">{original}</p>
          ) : null}
          {item.tagline ? (
            <p className="mt-1 text-sm text-mute">{item.tagline}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ScorePill
              label="IMDb"
              value={imdb || omdb?.imdbRating || imdb}
              hint={votesLabel(omdb?.imdbVotes)}
              color="#f5c518"
              href={
                imdbId ? `https://www.imdb.com/title/${imdbId}/` : undefined
              }
            />
            <ScorePill
              label="TMDB"
              value={tmdbScore}
              hint={votesLabel(item.vote_count)}
              color="#01b4e4"
              href={`https://www.themoviedb.org/${media}/${item.id}`}
            />
            <ScorePill
              label="Rotten Tomatoes"
              value={
                !imdbId
                  ? null
                  : critics === null
                    ? undefined
                    : critics.tomatometer === null
                      ? null
                      : `${critics.tomatometer}%`
              }
              color={tomatoColor(critics?.tomatometer ?? 100)}
              href={rottenTomatoesUrl(
                critics,
                item.original_title || item.original_name || title,
              )}
            />
          </div>
          <FriendsOnTitle media={media} id={item.id} />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
            {rated ? (
              <span
                title={`Возрастной рейтинг · ${rated.country}`}
                className="rounded border border-mute/60 px-1.5 font-mono text-xs text-ink"
              >
                {rated.code}
              </span>
            ) : null}
            {status && (media === "tv" || item.status !== "Released") ? (
              <span className="text-accent">{status}</span>
            ) : null}
            {media === "tv" && showTypeLabel(item.type) ? (
              <span>{showTypeLabel(item.type)}</span>
            ) : null}
            {runtime ? <span>{runtimeLabel(runtime)}</span> : null}
            {item.number_of_seasons ? (
              <span>{item.number_of_seasons} сез.</span>
            ) : null}
            {item.number_of_episodes ? (
              <span>{item.number_of_episodes} эп.</span>
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
      </div>

      {item.overview ? (
        <p className="max-w-3xl text-[15px] leading-7 text-ink/90">
          {item.overview}
        </p>
      ) : null}
      <AwardsLine omdb={omdb} />

      {imdbId ? (
        <CriticReviews
          imdbId={imdbId}
          critics={critics}
          title={item.original_title || item.original_name || title}
        />
      ) : null}

      <CollectionMark
        media={media}
        id={Number(id)}
        title={title}
        poster={posterUrl(item.poster_path, "w185")}
        year={year}
      />

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
      {media === "movie" ? (
        <ReleaseDates item={item} region={settings.region} />
      ) : null}
      <Videos videos={videos} />
      <Gallery item={item} />
      <Facts item={item} media={media} omdb={omdb} title={title} />
      <Franchise item={item} currentId={item.id} />

      <section className="mt-8">
        <div className="grid gap-6 md:grid-cols-3">
          <CrewColumn title="Режиссёр" people={directors} role="режиссёр" />
          <CrewColumn title="Продюсер" people={producers} role="продюсер" />
          <CrewColumn title="Сценарист" people={writers} role="сценарист" />
        </div>
        <CrewList rows={extraCrew(item)} />
      </section>

      {item.credits?.cast?.length ? (
        <section className="mt-8">
          <h2 className="text-lg tracking-tight">Актёры</h2>
          <div className="row-scroll mt-3 flex gap-3 overflow-x-auto pb-2">
            {item.credits.cast.slice(0, 16).map((c) => (
              <PersonCard key={c.id} person={c} role={c.character || "роль"} />
            ))}
          </div>
        </section>
      ) : null}

      <Reviews media={media} id={item.id} />

      {item.recommendations?.results?.length ? (
        <Section title="Рекомендации">
          <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
            {byCatalogRank(item.recommendations.results)
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
      ) : null}

      {item.similar?.results?.length ? (
        <Section title="Похожее">
          <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
            {byCatalogRank(
              item.similar.results.filter(
                (s) =>
                  !item.recommendations?.results.some((r) => r.id === s.id),
              ),
            )
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
      ) : null}

      <LinksRow item={item} media={media} />
    </article>
  );
}
