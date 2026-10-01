import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../components";
import {
  CARD,
  Overview,
  RatingsStrip,
  Aside,
  Videos,
  type Tile,
} from "../components/TitleDetails";
import {
  GameError,
  GameShelf,
  PlatformPicker,
  releaseLabel,
} from "../components/GameTile";
import { GameMark } from "../components/GameMark";
import {
  BestShelf,
  FeedShelves,
  GamePassShelves,
  Giveaways,
} from "../components/GameFeed";
import { ShareButton } from "../components/ShareButton";
import {
  CriticReviews,
  GameFacts,
  GameLinks,
  PcRequirements,
  Screens,
} from "../components/GameDetails";
import {
  ageRatings,
  gameDetails,
  gameTypeLabel,
  imageUrl,
  inGamePass,
  platformIds,
  ru,
  russianSupport,
  seriesGames,
  steamAppId,
  timeToBeat,
  toSummary,
  type RawGame,
} from "../lib/igdb";
import { ageLabels, platformList, tierOf } from "../lib/gameFacts";
import {
  openCritic,
  steamApp,
  type OpenCritic,
  type SteamApp,
} from "../lib/api";
import { toggleMyPlatform, useMyPlatforms } from "../lib/myPlatforms";
import { migrateGameLibrary } from "../lib/gameMigration";
import { votesShort } from "../lib/titleFacts";
import type { Video } from "../lib/tmdb";

export function GamesPage() {
  const mine = useMyPlatforms();
  const ids = platformIds(mine);
  useEffect(() => {
    migrateGameLibrary();
  }, []);
  const pass = mine.includes("pc") || mine.includes("xbox");
  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        игры
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Что поиграть</h1>
      <div className="mb-8 mt-4">
        <PlatformPicker value={mine} onToggle={toggleMyPlatform} />
      </div>
      <FeedShelves platforms={ids} />
      <Giveaways groups={mine} />
      {pass ? <GamePassShelves /> : null}
      <BestShelf platforms={ids} />
    </div>
  );
}

/* ------------------------------------------------------------ game page */

function metascoreColor(score: number) {
  if (score >= 75) return "#66cc33";
  if (score >= 50) return "#ffcc33";
  return "#ff4d4d";
}

/** Trailers first, launch trailer on top; diaries and spots after. */
const videoRank = (name = "") =>
  /launch trailer/i.test(name)
    ? 0
    : /trailer/i.test(name)
      ? 1
      : /teaser/i.test(name)
        ? 2
        : 3;

function videosOf(game: RawGame): Video[] {
  return (game.videos ?? [])
    .filter((v) => v.video_id)
    .sort((a, b) => videoRank(a.name) - videoRank(b.name))
    .map((v) => ({
      key: v.video_id!,
      site: "YouTube",
      name: v.name || "Видео",
      type: /teaser/i.test(v.name || "")
        ? "Teaser"
        : /trailer/i.test(v.name || "")
          ? "Trailer"
          : "",
      official: true,
    }));
}

/** Loads a side source; undefined while loading, null when it has nothing. */
function useSide<T>(load: (() => Promise<T>) | null, key: unknown[]) {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setValue(load ? undefined : null);
    load?.()
      .then((v) => alive && setValue(v ?? null))
      .catch(() => alive && setValue(null));
    return () => {
      alive = false;
    };
  }, key);
  return value;
}

function Related({ title, games }: { title: string; games?: RawGame[] }) {
  const list = (games ?? []).filter((g) => g?.name).map(toSummary);
  return <GameShelf title={title} games={list} />;
}

function Series({ game }: { game: RawGame }) {
  const collection = game.collections?.[0];
  const list = useAsync(
    () =>
      collection?.id
        ? seriesGames(collection.id, game.id)
        : Promise.resolve([]),
    [collection?.id, game.id],
  );
  if (!collection || !list.data?.length) return null;
  return (
    <GameShelf
      title={`Серия «${collection.name}»`}
      games={list.data}
      aside={<Aside>{list.data.length + 1} игр</Aside>}
    />
  );
}

export function GamePage() {
  const { id = "" } = useParams();
  const gameId = Number(id);
  const query = useAsync(() => gameDetails(gameId), [gameId]);
  const game = query.data?.id === gameId ? query.data : null;
  const year = game?.first_release_date
    ? new Date(game.first_release_date * 1000).getUTCFullYear()
    : null;
  const steamId = game ? steamAppId(game) : null;
  const steam = useSide<SteamApp>(
    game && steamId ? () => steamApp(steamId) : null,
    [game?.id, steamId],
  );
  const oc = useSide<OpenCritic>(
    game ? () => openCritic(game.name, year) : null,
    [game?.id],
  );
  const ages = useSide(game ? () => ageRatings(game.id) : null, [game?.id]);
  const russian = useSide(game ? () => russianSupport(game.id) : null, [
    game?.id,
  ]);
  const ttb = useSide(game ? () => timeToBeat(game.id) : null, [game?.id]);
  const gamePass = useSide(game ? () => inGamePass(game) : null, [game?.id]);
  useEffect(() => {
    migrateGameLibrary();
  }, []);

  if (!game && query.loading)
    return (
      <p role="status" className="text-sm text-mute">
        Собираю карточку игры…
      </p>
    );
  if (!game)
    return (
      <div className="space-y-4">
        <GameError code={query.error || "HTTP_404"} />
        <Link className="block text-accent" to="/games/search">
          К поиску игр
        </Link>
      </div>
    );

  const summary = toSummary(game);
  const cover = imageUrl(game.cover?.image_id, "cover_big");
  const backdrop =
    game.artworks?.[0]?.image_id || game.screenshots?.[0]?.image_id;
  const released = game.first_release_date ?? null;
  const upcoming = released !== null && released * 1000 > Date.now();
  const type = gameTypeLabel(game.game_type);
  const ageList = ageLabels(ages ?? []);
  const genres = [...(game.genres ?? []), ...(game.themes ?? [])]
    .map((g) => ru(g.name))
    .filter((g, i, all) => g && all.indexOf(g) === i);
  const platforms = platformList(game);
  const ocFound = oc?.found ? oc : null;
  const steamPercent =
    steam?.reviews && steam.reviews.total
      ? Math.round((steam.reviews.positive / steam.reviews.total) * 100)
      : null;

  const tiles: Tile[] = [
    {
      label: "OpenCritic",
      title: "OpenCritic — средняя оценка ведущих критиков",
      value:
        oc === undefined
          ? undefined
          : ocFound?.score != null
            ? String(ocFound.score)
            : null,
      sub: ocFound
        ? tierOf(ocFound.tier).label || `${ocFound.reviews} рец.`
        : null,
      color: tierOf(ocFound?.tier ?? null).color,
      href: ocFound?.url,
    },
    {
      label: "Metacritic",
      title: "Metascore — сводная оценка критиков",
      value:
        steamId && steam === undefined
          ? undefined
          : steam?.metacritic
            ? String(steam.metacritic.score)
            : null,
      sub: "критики",
      color: metascoreColor(steam?.metacritic?.score ?? 0),
      href: steam?.metacritic?.url,
    },
    {
      label: "Steam",
      title: "Доля положительных отзывов в Steam",
      value:
        steamId && steam === undefined
          ? undefined
          : steamPercent !== null
            ? `${steamPercent}%`
            : null,
      sub: votesShort(steam?.reviews?.total),
      color: steamPercent !== null && steamPercent < 70 ? "#c9a227" : "#66c0f4",
      href: steamId
        ? `https://store.steampowered.com/app/${steamId}/#app_reviews_hash`
        : undefined,
    },
    summary.users !== null
      ? {
          label: "Игроки",
          title: "Оценка игроков IGDB",
          value: summary.users.toFixed(1),
          sub: votesShort(game.rating_count),
          color: "#9147ff",
          href: `https://www.igdb.com/games/${game.slug || game.id}`,
        }
      : {
          label: "Критики",
          title: "Средняя оценка критиков по данным IGDB",
          value:
            summary.critics !== null && !ocFound?.score
              ? String(summary.critics)
              : null,
          sub: votesShort(game.aggregated_rating_count),
          color: "#9147ff",
          href: `https://www.igdb.com/games/${game.slug || game.id}`,
        },
  ];

  const about = steam?.about || steam?.short || "";
  const english = !about && (game.summary || game.storyline);

  return (
    <article className="rise pb-8">
      <header className={`${CARD} relative overflow-hidden rounded-3xl`}>
        <div
          className={`relative ${backdrop ? "h-52 sm:h-80" : cover ? "h-28 sm:h-36" : "h-16"}`}
        >
          {backdrop ? (
            <img
              src={imageUrl(backdrop, "screenshot_huge")}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full bg-canvas-soft" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
          <div className="absolute right-3 top-3">
            <ShareButton
              title={game.name}
              path={`/games/${game.id}`}
              text={`«${game.name}»${year ? ` (${year})` : ""}${ocFound?.score ? ` — OpenCritic ${ocFound.score}` : ""}. Смотри в Umbra:`}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-black/70"
            />
          </div>
        </div>
        <div
          className={`relative flex items-end gap-4 px-4 sm:px-6 ${backdrop ? "-mt-20 sm:-mt-28" : cover ? "-mt-16 sm:-mt-20" : "-mt-4"}`}
        >
          {cover ? (
            <img
              src={cover}
              alt=""
              className="w-24 shrink-0 rounded-xl border border-hairline shadow-[0_12px_30px_rgba(0,0,0,0.6)] sm:w-36"
            />
          ) : null}
          <div className="min-w-0 flex-1 pb-0.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              {type || "игра"}
              {year ? ` · ${year}` : ""}
            </p>
            <h1 className="mt-1 text-2xl leading-tight tracking-tight sm:text-4xl">
              {game.name}
            </h1>
            {game.parent_game?.name ? (
              <Link
                to={`/games/${game.parent_game.id}`}
                className="mt-0.5 block truncate text-sm text-dim hover:text-ink"
              >
                к игре «{game.parent_game.name}»
              </Link>
            ) : null}
          </div>
        </div>
        <div className="px-4 pb-5 pt-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-mute">
            {ageList[0] ? (
              <span
                title="Возрастной рейтинг"
                className="rounded border border-mute/60 px-1.5 font-mono text-xs text-ink"
              >
                {ageList[0]}
              </span>
            ) : null}
            {platforms.length ? <span>{platforms.join(" · ")}</span> : null}
            {gamePass ? (
              <span
                title="Игра сейчас в каталоге Xbox Game Pass"
                className="rounded border border-[#107c10] px-1.5 font-mono text-xs text-[#5fd35f]"
              >
                Game Pass
              </span>
            ) : null}
            {upcoming ? (
              <span className="text-accent">
                · выходит {releaseLabel(released)}
              </span>
            ) : null}
          </div>
          {genres.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-hairline px-2.5 py-1 text-xs text-mute"
                >
                  {g}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <RatingsStrip tiles={tiles} />

      <GameMark
        key={game.id}
        game={{
          id: game.id,
          title: game.name,
          thumbnail: imageUrl(game.cover?.image_id, "cover_big"),
          year: year ? String(year) : "",
          genre: genres[0] || "",
        }}
      />

      {about ? <Overview text={about} /> : null}
      {english ? (
        <>
          <Overview text={english} />
          <p className="mt-1 text-xs text-dim">Описание IGDB · на английском</p>
        </>
      ) : null}

      <Videos videos={videosOf(game)} />
      <Screens game={game} />
      <GameFacts
        game={game}
        ages={ageList}
        russian={russian ?? null}
        ttb={ttb ?? null}
        steam={steam ?? null}
      />
      <CriticReviews oc={oc} />
      <GameLinks game={game} steamId={steamId} />
      <div className="mt-10">
        <Related
          title="Дополнения"
          games={[...(game.expansions ?? []), ...(game.dlcs ?? [])]}
        />
        <Series game={game} />
        <Related
          title="Ремейки и ремастеры"
          games={[...(game.remakes ?? []), ...(game.remasters ?? [])]}
        />
        <Related title="Похожие игры" games={game.similar_games} />
      </div>
      <PcRequirements steam={steam ?? null} />
    </article>
  );
}
