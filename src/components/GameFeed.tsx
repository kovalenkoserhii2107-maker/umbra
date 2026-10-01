import { Link } from "react-router-dom";
import { useAsync } from "../components";
import { CARD } from "./TitleDetails";
import { GameError, GameShelf, releaseLabel } from "./GameTile";
import { GIVEAWAY_PLATFORMS, platformGiveaways } from "../lib/games";
import {
  gamePassGames,
  imageUrl,
  shelves,
  type GameSummary,
  type PlatformGroupId,
} from "../lib/igdb";

function Hero({ game, label }: { game: GameSummary; label: string }) {
  const cover = imageUrl(game.cover, "cover_big");
  const upcoming = game.released === null || game.released * 1000 > Date.now();
  return (
    <Link
      to={`/games/${game.id}`}
      className={`${CARD} relative flex w-[88%] shrink-0 snap-start items-end gap-4 overflow-hidden p-4 sm:w-[70%] sm:p-6 lg:w-[48%]`}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
      {cover ? (
        <img
          src={cover}
          alt=""
          className="relative w-24 shrink-0 rounded-xl border border-hairline shadow-[0_12px_30px_rgba(0,0,0,0.6)] sm:w-32"
        />
      ) : null}
      <div className="relative min-w-0 pb-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
          {label}
        </p>
        <p className="mt-1 line-clamp-3 text-2xl leading-tight tracking-tight sm:text-3xl">
          {game.name}
        </p>
        <p className="mt-1 text-sm text-mute">
          {upcoming
            ? game.released
              ? `выходит ${releaseLabel(game.released)}`
              : "дата не объявлена"
            : [game.genres.slice(0, 2).join(", "), game.year]
                .filter(Boolean)
                .join(" · ")}
        </p>
      </div>
    </Link>
  );
}

/** One swipeable row: the top new release, the most awaited, the most played. */
function Heroes({
  items,
}: {
  items: Array<{ game?: GameSummary; label: string }>;
}) {
  const seen = new Set<number>();
  const shown = items.filter(
    (i): i is { game: GameSummary; label: string } =>
      !!i.game && !seen.has(i.game.id) && (seen.add(i.game.id), true),
  );
  if (!shown.length) return null;
  return (
    <div className="row-scroll mb-10 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
      {shown.map((i) => (
        <Hero key={i.game.id} game={i.game} label={i.label} />
      ))}
    </div>
  );
}

const asideText = "font-mono text-[11px] uppercase tracking-[0.12em] text-dim";

export function FeedShelves({ platforms }: { platforms: number[] }) {
  const feed = useAsync(() => shelves(platforms), [platforms.join()]);
  const data = feed.data;
  if (feed.error && !data) return <GameError code={feed.error} />;
  if (!data)
    return (
      <p role="status" className="mb-10 text-sm text-mute">
        Собираю игры…
      </p>
    );
  return (
    <>
      <Heroes
        items={[
          { game: data.fresh[0], label: "главная новинка" },
          { game: data.awaited[0], label: "самая ожидаемая" },
          { game: data.popular[0], label: "больше всех играют" },
        ]}
      />
      <GameShelf
        title="Популярные новинки"
        games={data.fresh}
        aside={<span className={asideText}>за 4 месяца</span>}
      />
      <GameShelf title="Сейчас популярно" games={data.popular} />
      <GameShelf title="Самые ожидаемые" games={data.awaited} dated />
      <GameShelf
        title="Скоро выйдут"
        games={data.soon}
        dated
        aside={<span className={asideText}>2 месяца</span>}
      />
    </>
  );
}

export function BestShelf({ platforms }: { platforms: number[] }) {
  // Same request as FeedShelves; the client reuses the answer.
  const feed = useAsync(() => shelves(platforms), [platforms.join()]);
  return (
    <GameShelf
      title="Лучшие за год"
      games={feed.data?.best ?? []}
      aside={<span className={asideText}>по критикам</span>}
    />
  );
}

export function Giveaways({ groups }: { groups: readonly PlatformGroupId[] }) {
  const sources = [
    ...new Set(groups.flatMap((g) => GIVEAWAY_PLATFORMS[g] ?? [])),
  ];
  const drops = useAsync(() => platformGiveaways(sources), [sources.join()]);
  if (!drops.data?.length) return null;
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg font-medium tracking-tight">
          Раздают бесплатно
        </h2>
        <span className={asideText}>{drops.data.length}</span>
      </div>
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {drops.data.map((item) => (
          <a
            key={item.id}
            href={item.open_giveaway_url}
            target="_blank"
            rel="noreferrer"
            className="block w-[68vw] shrink-0 sm:w-72"
          >
            <div className="overflow-hidden rounded-xl border border-hairline bg-card">
              <img
                src={item.thumbnail || item.image}
                alt=""
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
            </div>
            <p className="mt-2 line-clamp-2 text-sm">{item.title}</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
              {item.platforms.split(",")[0]?.trim()}
              {item.type === "DLC" ? " · дополнение" : ""}
              {item.end_date && item.end_date !== "N/A"
                ? ` · до ${item.end_date.slice(8, 10)}.${item.end_date.slice(5, 7)}`
                : ""}
            </p>
          </a>
        ))}
      </div>
    </section>
  );
}

function PassShelf({
  list,
  title,
  dated,
}: {
  list: "recent" | "coming" | "leaving";
  title: string;
  dated?: boolean;
}) {
  const games = useAsync(() => gamePassGames(list), [list]);
  return (
    <GameShelf
      title={title}
      games={games.data ?? []}
      dated={dated}
      aside={<span className={`${asideText} text-[#107c10]`}>Game Pass</span>}
    />
  );
}

/** Shown when the player has a PC or an Xbox. */
export function GamePassShelves() {
  return (
    <>
      <PassShelf list="recent" title="Недавно в Game Pass" />
      <PassShelf list="coming" title="Скоро в Game Pass" dated />
      <PassShelf list="leaving" title="Скоро уйдут из Game Pass" />
    </>
  );
}
