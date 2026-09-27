import { Link, useParams } from "react-router-dom";
import { ErrorBox, useAsync } from "../components";
import { GameRow } from "../components/GameCard";
import { GameMark } from "../components/GameMark";
import { gameDetails, gameYear, gamesList } from "../lib/games";

export function GamesPage() {
  const popular = useAsync(() => gamesList({ "sort-by": "popularity" }), []);
  const fresh = useAsync(() => gamesList({ "sort-by": "release-date" }), []);
  const shooters = useAsync(
    () => gamesList({ category: "shooter", "sort-by": "popularity" }),
    [],
  );
  const roles = useAsync(
    () => gamesList({ category: "mmorpg", "sort-by": "popularity" }),
    [],
  );
  const strategy = useAsync(
    () => gamesList({ category: "strategy", "sort-by": "popularity" }),
    [],
  );

  const err = popular.error || fresh.error;
  if (err && !popular.data) return <ErrorBox code={err} />;

  const lead = popular.data?.[0];
  const rest = (popular.data ?? []).slice(1, 16);

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
              {lead.genre}
            </p>
            <p className="mt-1 text-2xl tracking-tight text-white sm:text-3xl">
              {lead.title}
            </p>
          </div>
        </Link>
      ) : null}
      <GameRow title="Популярные" items={rest} />
      <GameRow title="Новые" items={(fresh.data ?? []).slice(0, 16)} />
      <GameRow title="Шутеры" items={(shooters.data ?? []).slice(0, 16)} />
      <GameRow title="Ролевые" items={(roles.data ?? []).slice(0, 16)} />
      <GameRow title="Стратегии" items={(strategy.data ?? []).slice(0, 16)} />
    </div>
  );
}

export function GamePage() {
  const { id = "" } = useParams();
  const gameId = Number(id);
  const game = useAsync(
    () => (Number.isFinite(gameId) ? gameDetails(gameId) : Promise.reject(new Error("HTTP_404"))),
    [gameId],
  );

  if (game.error && !game.data) return <ErrorBox code={game.error} />;
  if (!game.data) return <p className="text-sm text-mute">Загрузка…</p>;

  const item = game.data;
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
      <img
        src={item.thumbnail}
        alt=""
        className="mt-6 aspect-video w-full rounded-2xl border border-hairline object-cover"
      />
      <GameMark game={item} />
      {item.description ? (
        <p className="mt-6 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-mute">
          {item.description}
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
