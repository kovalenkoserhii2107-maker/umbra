import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { yearOf } from "../lib/format";
import type { LibraryItem } from "../lib/library";
import {
  cachedRating,
  ensureImdbRating,
  subscribeRatings,
} from "../lib/ratings";
import { posterUrl, titleOf, type MediaType } from "../lib/tmdb";
import type { Pick } from "../lib/tonight";

/** The IMDb score, loaded on first show and shared through the ratings cache. */
function useImdb(type: MediaType, id: number) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeRatings(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    void ensureImdbRating(type, id).catch(() => undefined);
  }, [type, id]);
  return cachedRating(type, id).imdb ?? null;
}

const MINE: Record<LibraryItem["status"], string> = {
  watchlist: "в «Хочу посмотреть»",
  watching: "смотришь",
  watched: "смотрел",
  dropped: "бросил",
};

/** Building blocks shared by both evening pickers. */
export function Question({
  step,
  title,
  children,
  onBack,
  round,
}: {
  step: number;
  /** For later rounds of the AI picker. */
  round?: number;
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <section className="rise mt-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">
          {round && round > 1 ? `раунд ${round} · ` : ""}вопрос {step + 1} из 4
        </p>
        <div className="flex gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i <= step ? "bg-accent" : "bg-hairline"}`}
            />
          ))}
        </div>
      </div>
      <h2 className="mt-2 text-2xl tracking-tight">{title}</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{children}</div>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-sm text-mute"
        >
          ← Назад
        </button>
      ) : null}
    </section>
  );
}

export function Option({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border p-4 text-left transition ${active ? "border-accent bg-accent/10" : "border-hairline bg-card hover:border-accent/50"}`}
    >
      <span className="block text-base">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-xs text-mute">{hint}</span>
      ) : null}
    </button>
  );
}

export function PickCard({
  pick,
  saved,
  onSave,
  mine,
  children,
}: {
  pick: Pick;
  saved: boolean;
  onSave: () => void;
  /** The title in my collection, e.g. a film offered for a rewatch. */
  mine?: LibraryItem;
  /** Extra controls under the card, e.g. "seen it" for the AI picker. */
  children?: React.ReactNode;
}) {
  const href = `/title/${pick.type}/${pick.item.id}`;
  const poster = posterUrl(pick.item.poster_path, "w185");
  const year = yearOf(pick.item.release_date || pick.item.first_air_date);
  const imdb = useImdb(pick.type, pick.item.id);
  const tmdbScore =
    pick.item.vote_count && pick.item.vote_count >= 50
      ? pick.item.vote_average
      : null;
  const score = imdb
    ? `IMDb ${imdb}`
    : tmdbScore
      ? `TMDB ${tmdbScore.toFixed(1)}`
      : "";
  return (
    <article className="flex gap-3 rounded-2xl border border-hairline bg-card p-3">
      <Link to={href} className="w-20 shrink-0">
        {poster ? (
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="aspect-[2/3] w-full rounded-xl border border-hairline object-cover"
          />
        ) : (
          <div className="aspect-[2/3] rounded-xl border border-hairline bg-canvas" />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          to={href}
          className="block text-base leading-snug hover:text-accent"
        >
          {titleOf(pick.item)}
        </Link>
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-dim">
          {[pick.type === "tv" ? "сериал" : "фильм", year, score]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {mine && mine.status !== "watchlist" ? (
          <p className="mt-1 inline-block rounded-full border border-ok/40 px-2 py-0.5 text-[11px] text-ok">
            Ты {MINE[mine.status]}
            {mine.rating !== null ? ` · ${mine.rating}/10` : ""}
          </p>
        ) : null}
        {pick.reasons.length ? (
          <ul className="mt-1.5 space-y-0.5 text-xs text-accent">
            {pick.reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        ) : null}
        {pick.where?.length ? (
          <p className="mt-1.5 text-xs text-ok">
            Смотреть: {pick.where.join(", ")}
          </p>
        ) : null}
        {pick.item.overview ? (
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-mute">
            {pick.item.overview}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {/* A title I have seen stays as it is in the collection. */}
          {mine && mine.status !== "watchlist" ? null : (
            <button
              type="button"
              disabled={saved}
              onClick={onSave}
              className="rounded-full border border-hairline px-3 py-1 text-xs disabled:text-dim"
            >
              {saved ? "В «Хочу посмотреть»" : "+ Хочу посмотреть"}
            </button>
          )}
          {children}
        </div>
      </div>
    </article>
  );
}
