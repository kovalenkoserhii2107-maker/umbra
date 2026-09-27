import { Link, useParams } from "react-router-dom";
import { ErrorBox, useAsync } from "../components";
import { GameRow } from "../components/GameCard";
import { GamePoster } from "../components/GamePoster";
import { GameMark } from "../components/GameMark";
import { GameScoreLine, GameScores } from "../components/GameScores";
import { GameFacts, GameOffers } from "../components/GameDetails";
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
      {lead ? (
        <Link
          to={`/games/${lead.id}`}
          className="relative mb-10 block overflow-hidden rounded-2xl border border-hairline bg-card"
        >
          <GamePoster
            id={lead.id}
            fallback={lead.thumbnail}
            poster={lead.poster}
            hero
            className="aspect-video w-full object-cover sm:aspect-[21/9]"
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
  const remote = useAsync(() => gameDetails(gameId), [gameId]);
  const item = remote.data?.id === gameId ? remote.data : null;
  if (!item && remote.loading)
    return (
      <p role="status" className="text-sm text-mute">
        Загружаю игру…
      </p>
    );
  if (!item)
    return (
      <div className="space-y-4">
        <ErrorBox code={remote.error || "HTTP_404"} />
        <button
          className="rounded-full border border-hairline px-4 py-2"
          onClick={() => window.location.reload()}
        >
          Повторить загрузку
        </button>
        <Link className="block text-accent" to="/games/search">
          К поиску игр
        </Link>
      </div>
    );
  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        {item.genre}
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">{item.title}</h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
        {item.platform}
        {gameYear(item) ? ` · ${gameYear(item)}` : ""}
      </p>
      {item.developer ? (
        <Link
          to={`/games/studio/${encodeURIComponent(item.developer)}`}
          className="mt-3 inline-flex rounded-full border border-accent/50 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-accent"
        >
          {item.developer}
        </Link>
      ) : null}
      <GameScoreLine
        id={item.id}
        metacritic={item.metacritic}
        steam={item.steam}
      />
      <GamePoster
        hero
        id={item.id}
        fallback={item.thumbnail}
        poster={item.poster}
        className="mt-6 aspect-video w-full rounded-2xl border border-hairline object-cover"
      />
      <GameMark key={item.id} game={item} />
      <GameFacts game={item} />
      <section className="mt-8">
        <h2 className="text-xl">Об игре</h2>
        <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-mute">
          {item.description ||
            item.short_description ||
            "Описание пока недоступно."}
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-xl">Скриншоты</h2>
        {item.screenshots?.length ? (
          <div className="row-scroll mt-3 flex gap-3 overflow-x-auto pb-2">
            {item.screenshots.map((shot, index) => (
              <a
                key={shot.id}
                href={shot.full || shot.image}
                target="_blank"
                rel="noreferrer"
                className="shrink-0"
              >
                <img
                  src={shot.image}
                  alt={`${item.title} — скриншот ${index + 1}`}
                  className="aspect-video w-72 rounded-xl border border-hairline object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-mute">Скриншоты пока недоступны.</p>
        )}
      </section>
      <GameOffers game={item} />
      {item.requirements ? (
        <details className="mt-8 rounded-xl border border-hairline p-4">
          <summary className="cursor-pointer">
            Минимальные требования для PC
          </summary>
          <p className="mt-3 whitespace-pre-line text-sm text-mute">
            {item.requirements}
          </p>
        </details>
      ) : null}
      <a
        href={item.game_url}
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-flex h-10 items-center rounded-full bg-accent px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#1a1008]"
      >
        {item.game_url.includes("store.steampowered.com/")
          ? "Открыть Steam"
          : "Страница в источнике"}
      </a>
    </div>
  );
}
