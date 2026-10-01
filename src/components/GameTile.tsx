import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  PLATFORM_GROUPS,
  gameTypeLabel,
  groupsOf,
  imageUrl,
  type GameSummary,
} from "../lib/igdb";
import { dateLabel } from "../lib/format";

const isoDate = (seconds: number) =>
  new Date(seconds * 1000).toISOString().slice(0, 10);

export function releaseLabel(released: number | null) {
  return released ? dateLabel(isoDate(released)) : "";
}

/** Small colored dots for PC, PlayStation, Xbox and Switch. */
export function PlatformDots({ platforms }: { platforms: number[] }) {
  const groups = groupsOf(platforms);
  if (!groups.length) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {PLATFORM_GROUPS.filter((g) => groups.includes(g.id)).map((g) => (
        <span
          key={g.id}
          title={g.name}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: g.tint }}
        />
      ))}
    </span>
  );
}

function scoreTone(score: number) {
  if (score >= 75) return "bg-ok text-[#08130b]";
  if (score >= 50) return "bg-accent text-[#1a1008]";
  return "bg-mute text-canvas";
}

/** Portrait cover card, the game twin of the movie poster card. */
export function GameTile({
  game,
  layout = "row",
  note,
}: {
  game: GameSummary;
  layout?: "row" | "grid";
  /** Replaces the year line, e.g. with a release date. */
  note?: string;
}) {
  const cover = imageUrl(game.cover, "cover_big");
  const type = gameTypeLabel(game.type);
  return (
    <Link
      to={`/games/${game.id}`}
      className={`group block ${layout === "grid" ? "w-full" : "w-[42vw] shrink-0 sm:w-40"}`}
    >
      <div className="poster-hover relative overflow-hidden rounded-xl border border-hairline bg-card">
        {cover ? (
          <img
            src={cover}
            alt={game.name}
            loading="lazy"
            decoding="async"
            className="aspect-[3/4] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[3/4] items-end p-3 text-sm text-mute">
            {game.name}
          </div>
        )}
        {game.critics !== null ? (
          <span
            title="Оценка критиков"
            className={`absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${scoreTone(game.critics)}`}
          >
            {game.critics}
          </span>
        ) : null}
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="line-clamp-2 text-sm leading-snug">{game.name}</p>
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
          <PlatformDots platforms={game.platforms} />
          <span className="truncate">
            {note ?? [type, game.year].filter(Boolean).join(" · ")}
          </span>
        </p>
      </div>
    </Link>
  );
}

export function GameShelf({
  title,
  games,
  aside,
  dated,
}: {
  title: string;
  games: GameSummary[];
  aside?: ReactNode;
  /** Shows the release date instead of the year. */
  dated?: boolean;
}) {
  const [limit, setLimit] = useState(20);
  if (!games.length) return null;
  return (
    <section className="rise mb-10">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        {aside}
      </div>
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {games.slice(0, limit).map((game) => (
          <GameTile
            key={game.id}
            game={game}
            note={
              dated
                ? releaseLabel(game.released) || "дата не объявлена"
                : undefined
            }
          />
        ))}
        {limit < games.length ? (
          <button
            type="button"
            onClick={() => setLimit((n) => n + 20)}
            className="flex w-[42vw] shrink-0 flex-col items-center justify-center rounded-xl border border-hairline bg-card text-center sm:w-40"
          >
            <span className="text-2xl text-accent">→</span>
            <span className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
              Ещё {games.length - limit}
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function GameGrid({ games }: { games: GameSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {games.map((game) => (
        <GameTile key={game.id} game={game} layout="grid" />
      ))}
    </div>
  );
}

const API_ERRORS: Record<string, string> = {
  api_not_configured:
    "Игровой сервер не подключён: в репозитории нет переменной API_URL.",
  network: "Нет связи с игровым сервером. Проверь интернет и попробуй ещё раз.",
  twitch_not_configured: "На игровом сервере нет ключей Twitch для IGDB.",
  twitch_auth_failed: "Twitch не принял ключи IGDB. Проверь их в Secrets.",
  origin_not_allowed: "Игровой сервер не отвечает этому сайту.",
  HTTP_404: "Игра не найдена.",
};

export function GameError({ code }: { code: string }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-hairline bg-card p-6 text-sm text-mute"
    >
      {API_ERRORS[code] || `Не удалось загрузить игры (${code}).`}
    </div>
  );
}

/** Chips that switch the platforms a page shows. */
export function PlatformPicker({
  value,
  onToggle,
  label = "Мои платформы",
}: {
  value: readonly string[];
  onToggle: (id: (typeof PLATFORM_GROUPS)[number]["id"]) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {PLATFORM_GROUPS.map((g) => {
        const on = value.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(g.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
              on ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: g.tint }}
            />
            {g.name}
          </button>
        );
      })}
    </div>
  );
}
