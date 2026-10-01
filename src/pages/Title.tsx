import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBox, PlatformChip, PosterCard, useAsync } from "../components";
import { CollectionMark } from "../components/CollectionMark";
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
import { PLATFORMS } from "../lib/providers";
import { byCatalogRank } from "../lib/rank";
import { useAppState } from "../state";
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
}: {
  label: string;
  /** undefined while loading, null when the source has no score. */
  value: string | null | undefined;
  color: string;
  href?: string;
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

export function TitlePage() {
  const { type = "movie", id = "" } = useParams();
  const media = (type === "tv" ? "tv" : "movie") as MediaType;
  const { settings } = useAppState();
  const query = useAsync(() => tmdb.details(media, Number(id)), [media, id]);
  const [imdb, setImdb] = useState<string | null | undefined>(undefined);
  const [critics, setCritics] = useState<CriticScores | null>(null);

  useEffect(() => {
    let alive = true;
    setImdb(undefined);
    setCritics(null);
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
  const trailer =
    item.videos?.results.find(
      (v) => v.site === "YouTube" && v.type === "Trailer",
    ) || item.videos?.results.find((v) => v.site === "YouTube");
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
  const flatrate = region?.flatrate ?? [];
  const knownIds = new Set(PLATFORMS.map((p) => p.id));
  const imdbId = item.external_ids?.imdb_id || "";
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
          <h1 className="mt-1 text-2xl tracking-tight sm:text-4xl">{title}</h1>
          {item.tagline ? (
            <p className="mt-1 text-sm text-mute">{item.tagline}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ScorePill
              label="IMDb"
              value={imdb}
              color="#f5c518"
              href={
                imdbId ? `https://www.imdb.com/title/${imdbId}/` : undefined
              }
            />
            <ScorePill
              label="TMDB"
              value={tmdbScore}
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
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
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

      {imdbId ? (
        <CriticReviews
          imdbId={imdbId}
          critics={critics}
          title={item.original_title || item.original_name || title}
        />
      ) : null}

      {media === "tv" ? (
        <Seasons
          tvId={item.id}
          seasons={item.seasons}
          nextEpisode={item.next_episode_to_air}
          lastEpisode={item.last_episode_to_air}
        />
      ) : null}

      <CollectionMark
        media={media}
        id={Number(id)}
        title={title}
        poster={posterUrl(item.poster_path, "w185")}
        year={year}
      />

      <section className="mt-8">
        <h2 className="text-lg tracking-tight">
          Где смотреть · {settings.region}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {flatrate.length ? (
            flatrate.map((p) =>
              knownIds.has(p.provider_id) ? (
                <PlatformChip key={p.provider_id} id={p.provider_id} />
              ) : (
                <span
                  key={p.provider_id}
                  className="rounded-full border border-hairline px-3 py-1 text-xs text-mute"
                >
                  {p.provider_name}
                </span>
              ),
            )
          ) : (
            <p className="text-sm text-mute">
              В этом регионе подписка не найдена. Смени регион в настройках.
            </p>
          )}
        </div>
      </section>

      {trailer ? (
        <section className="mt-8">
          <h2 className="text-lg tracking-tight">Трейлер</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-hairline">
            <iframe
              title={trailer.name}
              className="aspect-video w-full"
              src={`https://www.youtube.com/embed/${trailer.key}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="grid gap-6 md:grid-cols-3">
          <CrewColumn title="Режиссёр" people={directors} role="режиссёр" />
          <CrewColumn title="Продюсер" people={producers} role="продюсер" />
          <CrewColumn title="Сценарист" people={writers} role="сценарист" />
        </div>
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

      {item.similar?.results?.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg tracking-tight">Похожее</h2>
          <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
            {byCatalogRank(item.similar.results)
              .slice(0, 12)
              .map((s) => (
              <PosterCard
                key={s.id}
                item={s}
                type={kindOf({ ...s, media_type: media })}
              />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
