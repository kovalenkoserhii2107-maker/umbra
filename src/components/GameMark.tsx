import { useState } from "react";
import {
  removeGame,
  saveGame,
  useGameLibrary,
  type GameShelfItem,
} from "../lib/gameLibrary";
import { gameYear, type Game } from "../lib/games";

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.4 14.7 8l6.2.9-4.5 4.4 1.1 6.2L12 16.6 6.5 19.5l1.1-6.2L3.1 8.9 9.3 8 12 2.4Z"
      />
    </svg>
  );
}

export function GameMark({ game }: { game: Game }) {
  const items = useGameLibrary();
  const mine = items.find((item) => item.id === game.id);
  const [panel, setPanel] = useState(false);
  const [stars, setStars] = useState(mine?.rating ?? 0);
  const [note, setNote] = useState(mine?.note ?? "");
  const played = mine?.status === "played";
  const wanted = mine?.status === "want";

  function entry(patch: Pick<GameShelfItem, "status" | "rating" | "note">) {
    saveGame({
      id: game.id,
      title: game.title,
      thumbnail: game.thumbnail,
      year: gameYear(game),
      genre: game.genre,
      updatedAt: Date.now(),
      ...patch,
    });
  }

  return (
    <div className="mt-6 rounded-2xl border border-hairline bg-card p-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setStars(mine?.rating ?? 0);
            setNote(mine?.note ?? "");
            setPanel(true);
          }}
          className={`rounded-full border px-3 py-1.5 text-sm ${played ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`}
        >
          В пройденные
        </button>
        <button
          type="button"
          onClick={() => {
            setPanel(false);
            entry({ status: "want", rating: null, note: "" });
          }}
          className={`rounded-full border px-3 py-1.5 text-sm ${wanted ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`}
        >
          Хочу поиграть
        </button>
        {mine ? (
          <button
            type="button"
            onClick={() => {
              setPanel(false);
              removeGame(game.id);
            }}
            className="rounded-full border border-hairline px-3 py-1.5 text-sm text-dim"
          >
            Убрать
          </button>
        ) : null}
      </div>
      {played && mine.rating ? (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
          {mine.rating}/10
          {mine.note ? ` · ${mine.note}` : ""}
        </p>
      ) : null}
      {panel ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-0.5" role="radiogroup" aria-label="Оценка">
            {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => (
              <button
                key={score}
                type="button"
                aria-label={`${score} из 10`}
                onClick={() => setStars(score)}
                className={`rounded-md p-0.5 ${score <= stars ? "text-accent" : "text-dim"}`}
              >
                <StarIcon />
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Комментарий"
            className="mt-3 w-full rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-accent/60"
            rows={3}
          />
          <button
            type="button"
            disabled={stars < 1}
            onClick={() => {
              entry({ status: "played", rating: stars, note: note.trim() });
              setPanel(false);
            }}
            className="mt-3 rounded-full bg-accent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#1a1008] disabled:opacity-40"
          >
            Подтвердить
          </button>
        </div>
      ) : null}
    </div>
  );
}
