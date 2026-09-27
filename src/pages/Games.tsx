import { Link, useParams } from "react-router-dom";
import { ErrorBox, useAsync } from "../components";
import { GameRow } from "../components/GameCard";
import { GameMark } from "../components/GameMark";
import { GameScoreLine, GameScores } from "../components/GameScores";
import { gameDetails, gameYear } from "../lib/games";
import { catalogGames, loadSteamCatalog } from "../lib/steamCatalog";

export function GamesPage() {
  const catalog = useAsync(() => loadSteamCatalog(), []);
  if (catalog.error && !catalog.data) return <ErrorBox code={catalog.error} />;
  if (!catalog.data) return <p className="text-sm text-mute">Загрузка…</p>;

  const popular = catalogGames(catalog.data, catalog.data.popular);
  const playing = catalogGames(catalog.data, catalog.data.playing);
  const upcoming = catalogGames(catalog.data, catalog.data.upcoming);
  const top = catalogGames(catalog.data, catalog.data.top);
  const lead = popular[0] || playing[0];

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        игры
      </p>
      <h1 className="mt-1 mb-8 text-3xl tracking-tight">Игры</h1>
      {lead ? (
        <Link
          to={`/games/${lead.id}`}
          className="relative mb-10 block overflow-hidden rounded-2xl border border-hairline bg-card"
        >
          <img
            src={lead.thumbnail}
            alt=""
            className="aspect-[16/9] w-full object-cover sm:aspect-[21/9]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              самое популярное
            </p>
            <p className="mt-1 max-w-[70%] text-2xl tracking-tight text-white sm:text-3xl">
              {lead.title}
            </p>
          </div>
          <GameScores
            id={lead.id}
            metacritic={lead.metacritic}
            steam={lead.steam}
          />
        </Link>
      ) : null}
      <GameRow title="Самое популярное" items={popular} />
      <GameRow title="Сейчас играют" items={playing.slice(0, 20)} />
      <GameRow title="Скоро выходит" items={upcoming} />
      <GameRow title="Топ 100" items={top} />
    </div>
  );
}

export function GamePage() {
  const { id = "" } = useParams();
  const gameId = Number(id);
  const catalog = useAsync(() => loadSteamCatalog(), []);
  const remote = useAsync(
    () =>
      Number.isFinite(gameId)
        ? gameDetails(gameId).catch(() => null)
        : Promise.resolve(null),
    [gameId],
  );
  const item = catalog.data?.games[String(gameId)] || remote.data;

  if (!item && (catalog.loading || remote.loading))
    return <p className="text-sm text-mute">Загрузка…</p>;
  if (!item) return <ErrorBox code={remote.error || "HTTP_404"} />;
  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        {item.genre}
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">{item.title}</h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
        {item.platform}
        {gameYear(item) ? ` · ${gameYear(item)}` : ""}
        {item.developer ? ` · ${item.developer}` : ""}
      </p>
      <GameScoreLine
        id={item.id}
        metacritic={item.metacritic}
        steam={item.steam}
      />
      <img
        src={item.thumbnail}
        alt=""
        className="mt-6 aspect-video w-full rounded-2xl border border-hairline object-cover"
      />
      <GameMark game={item} />
      {item.description || item.short_description ? (
        <p className="mt-6 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-mute">
          {item.description || item.short_description}
        </p>
      ) : null}
      {item.screenshots?.length ? (
        <div className="row-scroll mt-6 flex gap-3 overflow-x-auto pb-2">
          {item.screenshots.map((shot) => (
            <img
              key={shot.id}
              src={shot.image}
              alt=""
              className="h-36 w-auto rounded-xl border border-hairline object-cover"
              loading="lazy"
            />
          ))}
        </div>
      ) : null}
      <a
        href={item.game_url}
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-flex h-10 items-center rounded-full bg-accent px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#1a1008]"
      >
        Открыть игру
      </a>
    </div>
  );
}
