import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAsync } from "../components";
import { LoadingMotion } from "../components/LoadingMotion";
import { profileUrl } from "../lib/catalog";
import { plural, runtimeLabel, yearOf } from "../lib/format";
import { fetchCriticScores, fetchImdbRating } from "../lib/ratings";
import { fetchOmdbInfo } from "../lib/omdb";
import {
  awardsLabel,
  certification,
  crewCards,
  crewRows,
  detailRows,
  providerGroups,
  sortedVideos,
  statusLabel,
  votesShort,
} from "../lib/titleFacts";
import { useAuth } from "../lib/auth";
import { loadFriendsOn, useFriendList } from "../lib/friends";
import { Avatar, byInterest, sharedStatus } from "../components/FriendsIndex";
import { ImageViewer } from "../components/ImageViewer";
import {
  backdropUrl,
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
  appForProvider,
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
import {
  Facts,
  PROVIDER_STEP,
  PartTitle,
  Provider,
  REVIEW_STEP,
  RatingTiles,
  Reader,
  ReviewCard,
  STILL_STEP,
  Still,
  VIDEO_STEP,
  VideoCard,
  type RatingTile,
  type Review,
} from "./titleParts";

type Action = { key: string; label: string; accent?: boolean; run: () => void };

type Show = TitleDetails & { seasons?: SeasonCount[] };

/** "2019–2023" for finished shows, "2019 — н. в." for running ones. */
function years(item: Show, media: MediaType) {
  const first = yearOf(item.release_date || item.first_air_date);
  if (media !== "tv" || !first) return first;
  const last = yearOf((item as { last_air_date?: string }).last_air_date);
  if (item.in_production || item.status === "Returning Series")
    return `${first} — дотепер`;
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
          Не вдалося відкрити картку. Натисни «Назад».
        </p>
      </Stage>
    );
  if (!item || item.id !== Number(id))
    return (
      <Stage>
        <div className="flex h-full items-center justify-center">
          <LoadingMotion
            key={`${media}-${id}`}
            kind="movie"
            label="Збираю картку…"
          />
        </div>
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
  const imdbId = item.external_ids?.imdb_id || "";
  const imdb = useAsync(() => fetchImdbRating(imdbId), [imdbId]);
  const critics = useAsync(() => fetchCriticScores(imdbId), [imdbId]);
  const omdb = useAsync(
    () => (imdbId ? fetchOmdbInfo(imdbId) : Promise.resolve(null)),
    [imdbId],
  );
  const reviews = useAsync(
    () => tmdb.reviews(media, item.id),
    [media, item.id],
  );
  const series = item.belongs_to_collection;
  const collection = useAsync(
    () => (series ? tmdb.collection(series.id) : Promise.resolve(null)),
    [series?.id],
  );
  const { account } = useAuth();
  const friends = useFriendList(account?.sub || null);
  const friendKey = (friends.list ?? []).map((p) => p.uid).join();
  const friendRows = useAsync(
    () => loadFriendsOn(friends.list ?? [], media, item.id),
    [friendKey, media, item.id],
  );
  const [reading, setReading] = useState<Review | null>(null);

  // ---- actions ----
  const videos = sortedVideos(item.videos?.results);
  const offers = item["watch/providers"]?.results[settings.region];
  const installed = useMemo(() => installedApps(), [offers]);
  const apps = useMemo(() => watchApps(offers, installed), [offers, installed]);
  const actions: Action[] = [
    ...apps.map((a, i) => ({
      key: `watch-${a.app}`,
      label: `▶ Дивитися в ${a.name}`,
      accent: i === 0,
      run: () => launchTvApp(a.app, original || title),
    })),
    ...(hasLampa()
      ? [
          {
            key: "lampa",
            label: "Відкрити в Lampa",
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
            label: "＋ Хочу подивитися",
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
              label: "✓ У «Хочу подивитися»",
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
  const crew = crewCards(item);
  const where = providerGroups(offers).flatMap((g) =>
    g.providers.map((p) => {
      const app = appForProvider(p.provider_name);
      return {
        provider: p,
        how: g.label,
        app: app && installed[app] ? app : undefined,
      };
    }),
  );
  const allVideos = videos.slice(0, 15);
  const stills = (item.images?.backdrops ?? [])
    // Language-free frames are stills; titled ones are mostly promo art.
    .sort((a, b) => Number(!!a.iso_639_1) - Number(!!b.iso_639_1))
    .slice(0, 16);
  const facts = detailRows(item, media, omdb.data ?? null, settings.region);
  const reviewList = (reviews.data?.results ?? []).slice(0, 8) as Review[];
  const parts = cardsOf(
    [...(collection.data?.parts ?? [])]
      .filter((p) => p.id !== item.id)
      .sort((a, b) =>
        (a.release_date || "9999").localeCompare(b.release_date || "9999"),
      )
      .map((p) => ({ ...p, media_type: "movie" as const })),
    "movie",
  );
  const recommendations = cardsOf(item.recommendations?.results ?? [], media);
  const similar = cardsOf(item.similar?.results ?? [], media).filter(
    (c) => !recommendations.some((r) => r.id === c.id),
  );

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
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
      key: "where",
      size: where.length,
      onSelect: (i) => {
        const w = where[i];
        if (w?.app) launchTvApp(w.app, original || title);
      },
    },
    {
      key: "videos",
      size: allVideos.length,
      onSelect: (i) => allVideos[i] && playTrailer(allVideos[i].key),
    },
    {
      key: "stills",
      size: stills.length > 0 ? stills.length : 0,
      onSelect: (i) => setViewerIndex(i),
    },
    {
      key: "cast",
      size: cast.length,
      onSelect: (i) => cast[i] && navigate(`/person/${cast[i].id}`),
    },
    {
      key: "crew",
      size: crew.length,
      onSelect: (i) => crew[i] && navigate(`/person/${crew[i].person.id}`),
    },
    { key: "details", size: facts.length ? 1 : 0 },
    {
      key: "reviews",
      size: reviewList.length,
      onSelect: (i) => reviewList[i] && setReading(reviewList[i]),
    },
    {
      key: "franchise",
      size: parts.length,
      onSelect: (i) => parts[i] && navigate(`/title/movie/${parts[i].id}`),
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

  const rated = certification(item, media, settings.region);
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

  const tiles: RatingTile[] = [
    {
      label: "IMDb",
      value: imdb.loading
        ? undefined
        : imdb.data || omdb.data?.imdbRating || null,
      sub: votesShort(omdb.data?.imdbVotes),
      color: "#f5c518",
    },
    {
      label: "TMDB",
      value:
        item.vote_count && item.vote_average
          ? item.vote_average.toFixed(1)
          : null,
      sub: votesShort(item.vote_count),
      color: "#01b4e4",
    },
    {
      label: "Rotten Tomatoes",
      value: critics.loading
        ? undefined
        : critics.data?.tomatometer != null
          ? `${critics.data.tomatometer}%`
          : null,
      sub:
        critics.data?.tomatometer != null
          ? critics.data.tomatometer >= 60
            ? "свіжий"
            : "гнилий"
          : null,
      color: (critics.data?.tomatometer ?? 100) >= 60 ? "#fa320a" : "#0ac855",
    },
    {
      label: "Metacritic",
      value: critics.loading
        ? undefined
        : critics.data?.metascore != null
          ? String(critics.data.metascore)
          : null,
      sub: critics.data?.metascore != null ? "критики" : null,
      color:
        (critics.data?.metascore ?? 0) >= 61
          ? "#66cc33"
          : (critics.data?.metascore ?? 0) >= 40
            ? "#ffcc33"
            : "#ff4d4d",
    },
  ];
  const lead = crewRows(item).find(
    (r) => r.role === "Режисер" || r.role === "Творці",
  );
  const stars = (item.credits?.cast ?? []).slice(0, 3).map((c) => c.name);
  const awards = awardsLabel(omdb.data?.awards);
  const friendList = [...(friendRows.data ?? [])].sort(byInterest).slice(0, 4);

  // Buttons and the rating keep the description in view; rows below take
  // the upper part of the screen.
  const top = nav.lane === "actions" || nav.lane === "rating";
  const at = (lane: string, i: number) =>
    nav.lane === lane && nav.col(lane) === i;
  // A still in focus fills the screen behind, nearly bright.
  const still = nav.lane === "stills" ? stills[nav.col("stills")] : null;

  return (
    <Stage>
      <Backdrop
        path={still?.file_path ?? item.backdrop_path}
        dim={still ? 0.35 : top ? 0.85 : 0.95}
      />
      <LaneStack focus={nav.lane} anchor={top ? 400 : 150} top={0}>
        <header className="relative px-12 pb-5 pt-12">
          <div className="w-[560px]">
            <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-accent">
              {media === "tv" ? "серіал" : "фільм"}
            </p>
            <h1 className="mt-1 line-clamp-2 text-[36px] leading-[1.08] tracking-tight">
              {title}
            </h1>
            {original && original !== title ? (
              <p className="mt-1 truncate text-[15px] text-white/50">
                {original}
              </p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-white/75">
              {rated ? (
                <span className="rounded border border-white/50 px-1.5 font-mono text-[12px] text-ink">
                  {rated.code}
                </span>
              ) : null}
              {meta.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
            {item.tagline ? (
              <p className="mt-2 truncate text-[14px] italic text-white/60">
                {item.tagline}
              </p>
            ) : null}
            {item.overview ? (
              <p className="mt-2 line-clamp-3 text-[15px] leading-snug text-white/85">
                {item.overview}
              </p>
            ) : null}
            {lead || stars.length ? (
              <p className="mt-2 line-clamp-1 text-[13px] text-white/60">
                {lead ? (
                  <>
                    {lead.role}:{" "}
                    <span className="text-white/85">
                      {lead.people
                        .slice(0, 2)
                        .map((p) => p.name)
                        .join(", ")}
                    </span>
                  </>
                ) : null}
                {lead && stars.length ? " · " : ""}
                {stars.length ? (
                  <>
                    В ролях:{" "}
                    <span className="text-white/85">{stars.join(", ")}</span>
                  </>
                ) : null}
              </p>
            ) : null}
            {awards ? (
              <p className="mt-1.5 line-clamp-1 text-[13px] text-white/75">
                <span className="text-[#f5c518]">★</span> {awards}
              </p>
            ) : null}
            {mine ? (
              <p className="mt-2 text-[13px] text-accent">
                {mine.status === "watchlist"
                  ? "У «Хочу подивитися»"
                  : mine.status === "watching"
                    ? progress
                      ? `Дивлюся · переглянуто до S${progress.season}E${progress.episode}`
                      : "Дивлюся"
                    : mine.status === "watched"
                      ? "Переглянуто"
                      : "Покинуто"}
                {mine.rating ? ` · твоя оцінка ${mine.rating}` : ""}
              </p>
            ) : null}
          </div>
          {/* Scores and friends on the right, over the picture. */}
          <div className="absolute right-12 top-12 w-[264px]">
            <RatingTiles tiles={tiles} />
            {friendList.length ? (
              <div className="mt-3 rounded-2xl bg-black/60 px-3 py-2">
                <p className="text-[11px] text-white/60">Оцінки друзів</p>
                {friendList.map(({ friend, rating }) => (
                  <p
                    key={friend.uid}
                    className="mt-1.5 flex items-center gap-2 text-[13px]"
                  >
                    <Avatar person={friend} size={22} />
                    <span className="min-w-0 flex-1 truncate">
                      {friend.name}
                    </span>
                    <span
                      className={`shrink-0 font-mono ${rating.rating ? "font-bold text-accent" : "text-white/50"}`}
                    >
                      {sharedStatus(rating)}
                    </span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
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

        <PillLane lane="rating" title="Твоя оцінка">
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
            title="Сезони"
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
            title={`Сезон ${seasonNumber} · ${episodeList.length} ${plural(episodeList.length, "серія", "серії", "серій")} — OK позначає переглянуте`}
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

        {where.length ? (
          <Rail
            lane="where"
            title={`Де дивитися · ${settings.region}`}
            count={where.length}
            step={PROVIDER_STEP}
            col={nav.col("where")}
          >
            {where.map((w, i) => (
              <Provider
                key={`${w.how}-${w.provider.provider_id}`}
                provider={w.provider}
                how={w.how}
                opens={Boolean(w.app)}
                focused={at("where", i)}
              />
            ))}
          </Rail>
        ) : null}

        {allVideos.length ? (
          <Rail
            lane="videos"
            title={`Відео · ${allVideos.length}`}
            count={allVideos.length}
            step={VIDEO_STEP}
            col={nav.col("videos")}
          >
            {allVideos.map((v, i) => (
              <VideoCard key={v.key} video={v} focused={at("videos", i)} />
            ))}
          </Rail>
        ) : null}

        {stills.length > 0 ? (
          <Rail
            lane="stills"
            title="Кадри"
            count={stills.length}
            step={STILL_STEP}
            col={nav.col("stills")}
          >
            {stills.map((img, i) => (
              <Still
                key={img.file_path}
                path={img.file_path}
                focused={at("stills", i)}
              />
            ))}
          </Rail>
        ) : null}

        {cast.length ? (
          <Rail
            lane="cast"
            title="У ролях"
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

        {crew.length ? (
          <Rail
            lane="crew"
            title="Знімальна група"
            count={crew.length}
            step={PERSON_STEP}
            col={nav.col("crew")}
          >
            {crew.map(({ person, roles }, i) => (
              <Person
                key={person.id}
                name={person.name}
                role={roles.join(", ")}
                photo={
                  person.profile_path ? profileUrl(person.profile_path) : null
                }
                focused={at("crew", i)}
              />
            ))}
          </Rail>
        ) : null}

        {facts.length ? (
          <section data-lane="details" className="pb-5">
            <PartTitle>Подробиці</PartTitle>
            <Facts rows={facts} focused={at("details", 0)} />
          </section>
        ) : null}

        {reviewList.length ? (
          <Rail
            lane="reviews"
            title={`Рецензії глядачів TMDB · ${reviews.data!.total_results} · англійською — OK читати`}
            count={reviewList.length}
            step={REVIEW_STEP}
            col={nav.col("reviews")}
          >
            {reviewList.map((r, i) => (
              <ReviewCard key={r.id} review={r} focused={at("reviews", i)} />
            ))}
          </Rail>
        ) : null}

        {parts.length ? (
          <Rail
            lane="franchise"
            title={`${collection.data?.name || series?.name} · ${parts.length + 1} у серії`}
            count={parts.length}
            step={POSTER_STEP}
            col={nav.col("franchise")}
          >
            {parts.map((c, i) => (
              <Poster
                key={c.id}
                card={c}
                focused={at("franchise", i)}
                caption="year"
              />
            ))}
          </Rail>
        ) : null}

        {recommendations.length ? (
          <Rail
            lane="recs"
            title="Рекомендації"
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
            title="Схоже"
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
      {reading ? (
        <Reader
          title={reading.author}
          sub={[
            reading.author_details?.rating
              ? `${reading.author_details.rating}/10`
              : "",
            title,
          ]
            .filter(Boolean)
            .join(" · ")}
          text={reading.content}
          onClose={() => setReading(null)}
        />
      ) : null}
      {viewerIndex !== null ? (
        <ImageViewer
          images={stills.map((img, i) => ({
            src: backdropUrl(img.file_path, "original"),
            thumb: backdropUrl(img.file_path, "w780"),
            alt: `Кадр ${i + 1}`,
          }))}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          title="Кадри"
        />
      ) : null}
    </Stage>
  );
}
