import { Link } from "react-router-dom";
import { gameYear, type Game } from "../lib/games";
import { GamePoster } from "./GamePoster";
import { GameScores } from "./GameScores";

export function GameCard({
  game,
  layout = "row",
}: {
  game: Game;
  layout?: "row" | "grid";
}) {
  return (
    <div
      className={`block ${layout === "grid" ? "w-full" : "w-[42vw] shrink-0 sm:w-40"}`}
    >
      <Link to={`/games/${game.id}`}>
        <div className="poster-hover relative overflow-hidden rounded-xl border border-hairline bg-card">
          <GamePoster
            id={game.id}
            fallback={game.thumbnail}
            className="aspect-[2/3] w-full object-cover"
          />
          <GameScores
            id={game.id}
            metacritic={game.metacritic}
            steam={game.steam}
          />
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-snug">{game.title}</p>
      </Link>
      {game.developer ? (
        <Link
          to={`/games/studio/${encodeURIComponent(game.developer)}`}
          className="mt-1 block truncate font-mono text-[11px] uppercase tracking-[0.14em] text-accent"
        >
          {game.developer}
        </Link>
      ) : null}
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
        {game.genre}
        {gameYear(game) ? ` · ${gameYear(game)}` : ""}
      </p>
    </div>
  );
}

export function GameRow({ title, items }: { title: string; items: Game[] }) {
  if (!items.length) return null;
  return (
    <section className="rise mb-10">
      <h2 className="mb-3 text-lg font-medium tracking-tight">{title}</h2>
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {items.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </section>
  );
}