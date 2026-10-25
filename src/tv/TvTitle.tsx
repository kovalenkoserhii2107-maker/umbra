import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAsync } from "../components";
import { profileUrl } from "../lib/catalog";
import { plural, runtimeLabel, yearOf } from "../lib/format";
import { fetchImdbRating } from "../lib/ratings";
import { sortedVideos, statusLabel } from "../lib/titleFacts";
import {
  posterUrl,
  titleOf,
  tmdb,
  type MediaType,
  type TitleDetails,
} from "../lib/tmdb";
import {
  isWatched,
  nextEpisode,
  previousEpisode,
  progressOf,
  type Episode as EpisodeRef,
  type SeasonCount,
} from "../lib/tracking";
import { tvApi } from "../lib/tv";
import {
  hasLampa,
  installedApps,
  launchTvApp,
  openInLampa,
  playTrailer,
  watchApps,
} from "../lib/tvMode";
import { useAppState } from "../state";
import { cardsOf } from "./cards";
import { screenKey, useLanes, type Lane } from "./lanes";
import {
  Backdrop,
  EPISODE_STEP,
  Episode,
  LaneStack,
  PERSON_STEP,
  POSTER_STEP,
  Person,
  Pill,
  PillLane,
  Poster,
  Rail,
  Stage,
} from "./ui";

type Action = { key: string; label: string; accent?: boolean; run: () => void };

type Show = TitleDetails & { seasons?: SeasonCount[] };

/** "2019–2023" for finished shows, "2019 — н. в." for running ones. */
function years(item: Show, media: MediaType) {
  const first = yearOf(item.release_date || item.first_air_date);
  if (media !== "tv" || !first) return first;
  const last = yearOf((item as { last_air_date?: string }).last_air_date);
  if (item.in_production || item.status === "Returning Series")
    return `${first} — н. в.`;
  return last && last !== first ? `${first}–${last}` : first;
}

/** A film or a series on the TV: the picture, the essentials, then rows. */
export function TvTitle() {
  const { type = "movie", id = "" } = useParams();
  const media: MediaType = type === "tv" ? "tv" : "movie";
  const query = useAsync(() => tmdb.details(media, Number(id)), [media, id]);
  const item = query.data as Show | null;
  if (query.error)
    return (
      <Stage>
        <p className="absolute left-12 top-24 text-mute">
          Не удалось открыть карточку. Нажми «Назад».
        </p>
      </Stage>
    );
  if (!item || item.id !== Number(id))
    return (
      <Stage>
        <p className="absolute left-12 top-24 text-mute">Загружаю…</p>
      </Stage>
    );
  return <TitleView key={`${media}-${id}`} item={item} media={media} />;
}

function TitleView({ item, media }: { item: Show; media: MediaType }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, get, upsert, update, remove } = useAppState();
  const mine = get(media, item.id);
  const title = titleOf(item);
  const original = item.original_title || item.original_name;
  const year = yearOf(item.release_date || item.first_air_date);
  const poster = posterUrl(item.poster_path, "w185");
  const imdb = useAsync(
    () => fetchImdbRating(item.external_ids?.imdb_id),
    [item.external_ids?.imdb_id],
  );

  // ---- actions ----
  const videos = sortedVideos(item.videos?.results);
  const offers = item["watch/providers"]?.results[settings.region];
  const apps = useMemo(() => watchApps(offers, installedApps()), [offers]);
  const actions: Action[] = [
    ...apps.map((a, i) => ({
      key: `watch-${a.app}`,
      label: `▶ Смотреть в ${a.name}`,
      accent: i === 0,
      run: () => launchTvApp(a.app, original || title),
    })),
    ...(hasLampa()
      ? [
          {
            key: "lampa",
            label: "Открыть в Lampa",
            accent: !apps.length,
            run: () => openInLampa(media, item.id),
          },
        ]
      : []),
    ...(videos[0]
      ? [
          {
            key: "trailer",
            label: "Трейлер",
            run: () => playTrailer(videos[0].key),
          },
        ]
      : []),
    ...(!mine
      ? [
          {
            key: "want",
            label: "＋ Хочу посмотреть",
            run: () =>
              upsert({
                id: item.id,
                type: media,
                title,
                poster,
                year,
                status: "watchlist",
                rating: null,
                note: "",
              }),
          },
        ]
      : mine.status === "watchlist" && !mine.note
        ? [
            {
              key: "want",
              label: "✓ В «Хочу посмотреть»",
              run: () => remove(media, item.id),
            },
          ]
        : []),
  ];

  // ---- your rating: picking one also marks the title as seen ----
  function rate(value: number) {
    if (!mine) {
      upsert({
        id: item.id,
        type: media,
        title,
        poster,
        year,
        status: "watched",
        rating: value,
        note: "",
      });
      return;
    }
    if (mine.rating === value) {
      update(media, item.id, { rating: null });
      return;
    }
    const status =
      mine.status === "watchlist" || mine.status === "dropped"
        ? "watched"
        : mine.status;
    update(media, item.id, { rating: value, status });
  }

  // ---- seasons and episodes ----
  const seasons = (item.seasons ?? []).filter(
    (s) => s.season_number > 0 && s.episode_count > 0,
  );
  const progress = progressOf(mine);
  const next = nextEpisode(progress, seasons);
  const startSeason = Math.max(
    0,
    seasons.findIndex(
      (s) => s.season_number === (next?.season ?? progress?.season ?? 1),
    ),
  );

  function markEpisode(ep: EpisodeRef) {
    // OK on the last watched episode takes it back; on another — watched up to it.
    const target =
      progress &&
      progress.season === ep.season &&
      progress.episode === ep.episode
        ? previousEpisode(ep, seasons)
        : ep;
    if (mine) {
      const status = mine.status === "watched" ? "watched" : "watching";
      update(media, item.id, { ...target, status });
      return;
    }
    upsert({
      id: item.id,
      type: media,
      title,
      poster,
      year,
      status: "watching",
      rating: null,
      note: "",
      ...target,
    });
  }

  // ---- rows ----
  const cast = (item.credits?.cast ?? []).slice(0, 20);
  const recommendations = cardsOf(item.recommendations?.results ?? [], media);
  const similar = cardsOf(item.similar?.results ?? [], media).filter(
    (c) => !recommendations.some((r) => r.id === c.id),
  );

  const [seasonNumber, setSeasonNumber] = useState(
    seasons[startSeason]?.season_number ?? 0,
  );
  const episodes = useAsync(
    () =>
      seasonNumber
        ? tvApi.season(item.id, seasonNumber)
        : Promise.resolve(null),
    [item.id, seasonNumber],
  );
  const episodeList = episodes.data?.episodes ?? [];

  const lanes: Lane[] = [
    {
      key: "actions",
      size: actions.length,
      onSelect: (i) => actions[i]?.run(),
    },
    { key: "rating", size: 10, onSelect: (i) => rate(i + 1) },
    {
      key: "seasons",
      size: seasons.length > 1 ? seasons.length : 0,
      onSelect: () => nav.focus("episodes"),
    },
    {
      key: "episodes",
      size: episodeList.length,
      onSelect: (i) => {
        const ep = episodeList[i];
        if (ep)
          markEpisode({ season: ep.season_number, episode: ep.episode_number });
      },
    },
    {
      key: "cast",
      size: cast.length,
      onSelect: (i) => cast[i] && navigate(`/person/${cast[i].id}`),
    },
    {
      key: "recs",
      size: recommendations.length,
      onSelect: (i) => {
        const c = recommendations[i];
        if (c) navigate(`/title/${c.type}/${c.id}`);
      },
    },
    {
      key: "similar",
      size: similar.length,
      onSelect: (i) => {
        const c = similar[i];
        if (c) navigate(`/title/${c.type}/${c.id}`);
      },
    },
  ];
  const nav = useLanes(lanes, {
    lane: actions.length ? "actions" : "rating",
    cols: {
      seasons: startSeason,
      episodes: Math.max(0, (next?.episode ?? 1) - 1),
    },
    remember: screenKey(location.pathname),
  });

  // The episodes row follows the season in focus (after a short pause).
  const seasonCol = nav.col("seasons");
  useEffect(() => {
    const wanted = seasons[seasonCol]?.season_number;
    if (!wanted || wanted === seasonNumber) return;
    const timer = window.setTimeout(() => setSeasonNumber(wanted), 250);
    return () => window.clearTimeout(timer);
  }, [seasonCol]);

  const meta = [
    years(item, media),
    media === "tv"
      ? item.number_of_seasons
        ? `${item.number_of_seasons} ${plural(item.number_of_seasons, "сезон", "сезона", "сезонов")}`
        : null
      : runtimeLabel(item.runtime),
    (item.genres ?? [])
      .slice(0, 3)
      .map((g) => g.name)
      .join(", ") || null,
    media === "tv" ? statusLabel(item.status) : null,
  ].filter(Boolean);

  // Buttons and the rating keep the description in view; rows below take
  // the upper part of the screen.
  const top = nav.lane === "actions" || nav.lane === "rating";
  const at = (lane: string, i: number) =>
    nav.lane === lane && nav.col(lane) === i;

  return (
    <Stage>
      <Backdrop path={item.backdrop_path} dim={top ? 0.85 : 0.95} />
      <LaneStack focus={nav.lane} anchor={top ? 380 : 150} top={0}>
        <header className="w-[640px] px-12 pb-6 pt-14">
          <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-accent">
            {media === "tv" ? "сериал" : "фильм"}
          </p>
          <h1 className="mt-1 line-clamp-2 text-[36px] leading-[1.08] tracking-tight">
            {title}
          </h1>
          {original && original !== title ? (
            <p className="mt-1 truncate text-[15px] text-white/50">
              {original}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-white/75">
            {imdb.data ? (
              <span className="rounded bg-[#f5c518] px-1.5 py-0.5 font-bold text-black">
                IMDb {imdb.data}
              </span>
            ) : null}
            {item.vote_count ? (
              <span className="text-[#01b4e4]">
                TMDB {item.vote_average?.toFixed(1)}
              </span>
            ) : null}
            {meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
          {item.overview ? (
            <p className="mt-3 line-clamp-4 text-[15px] leading-snug text-white/85">
              {item.overview}
            </p>
          ) : null}
          {mine ? (
            <p className="mt-3 text-[13px] text-accent">
              {mine.status === "watchlist"
                ? "В «Хочу посмотреть»"
                : mine.status === "watching"
                  ? progress
                    ? `Смотрю · просмотрено до S${progress.season}E${progress.episode}`
                    : "Смотрю"
                  : mine.status === "watched"
                    ? "Просмотрено"
                    : "Брошено"}
              {mine.rating ? ` · твоя оценка ${mine.rating}` : ""}
            </p>
          ) : null}
        </header>

        {actions.length ? (
          <PillLane lane="actions">
            {actions.map((a, i) => (
              <Pill key={a.key} focused={at("actions", i)} accent={a.accent}>
                {a.label}
              </Pill>
            ))}
          </PillLane>
        ) : null}

        <PillLane lane="rating" title="Твоя оценка">
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              data-focused={at("rating", i) || undefined}
              className={`flex h-10 w-10 items-center justify-center rounded-full font-mono text-[15px] transition-transform duration-150 ${
                at("rating", i)
                  ? "scale-110 bg-ink text-canvas"
                  : mine?.rating === i + 1
                    ? "bg-accent text-black"
                    : "bg-white/10"
              }`}
            >
              {i + 1}
            </span>
          ))}
        </PillLane>

        {seasons.length > 1 ? (
          <Rail
            lane="seasons"
            title="Сезоны"
            count={seasons.length}
            step={122}
            col={nav.col("seasons")}
          >
            {seasons.map((s, i) => (
              <span key={s.season_number} className="w-[108px] shrink-0">
                <Pill
                  wide
                  focused={at("seasons", i)}
                  accent={s.season_number === seasonNumber && !at("seasons", i)}
                >
                  Сезон {s.season_number}
                </Pill>
              </span>
            ))}
          </Rail>
        ) : null}

        {episodeList.length ? (
          <Rail
            lane="episodes"
            title={`Сезон ${seasonNumber} · ${episodeList.length} ${plural(episodeList.length, "серия", "серии", "серий")} — OK отмечает просмотренное`}
            count={episodeList.length}
            step={EPISODE_STEP}
            col={nav.col("episodes")}
          >
            {episodeList.map((ep, i) => (
              <Episode
                key={ep.id}
                number={ep.episode_number}
                name={ep.name}
                still={ep.still_path ? posterUrl(ep.still_path, "w300") : null}
                watched={isWatched(progress, {
                  season: ep.season_number,
                  episode: ep.episode_number,
                })}
                focused={at("episodes", i)}
              />
            ))}
          </Rail>
        ) : null}

        {cast.length ? (
          <Rail
            lane="cast"
            title="В ролях"
            count={cast.length}
            step={PERSON_STEP}
            col={nav.col("cast")}
          >
            {cast.map((c, i) => (
              <Person
                key={c.id}
                name={c.name}
                role={c.character}
                photo={c.profile_path ? profileUrl(c.profile_path) : null}
                focused={at("cast", i)}
              />
            ))}
          </Rail>
        ) : null}

        {recommendations.length ? (
          <Rail
            lane="recs"
            title="Рекомендации"
            count={recommendations.length}
            step={POSTER_STEP}
            col={nav.col("recs")}
          >
            {recommendations.map((c, i) => (
              <Poster key={c.id} card={c} focused={at("recs", i)} caption />
            ))}
          </Rail>
        ) : null}

        {similar.length ? (
          <Rail
            lane="similar"
            title="Похожее"
            count={similar.length}
            step={POSTER_STEP}
            col={nav.col("similar")}
          >
            {similar.map((c, i) => (
              <Poster key={c.id} card={c} focused={at("similar", i)} caption />
            ))}
          </Rail>
        ) : null}
        <div className="h-[400px]" />
      </LaneStack>
    </Stage>
  );
}
