import { Link } from "react-router-dom";
import { gameYear, type Game } from "../lib/games";
import { GameScores } from "./GameScores";

export function GameCard({
  game,
  layout = "row",
}: {
  game: Game;
  layout?: "row" | "grid";
}) {
  return (
    <Link
      to={`/games/${game.id}`}
      className={`block ${layout === "grid" ? "w-full" : "w-[68vw] shrink-0 sm:w-72"}`}
    >
      <div className="poster-hover relative overflow-hidden rounded-xl border border-hairline bg-card">
        <img
          src={game.thumbnail}
          alt=""
          className="aspect-video w-full object-cover"
          loading="lazy"
        />
        <GameScores id={game.id} />
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-snug">{game.title}</p>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
        {game.genre}
        {gameYear(game) ? ` · ${gameYear(game)}` : ""}
      </p>
    </Link>
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
