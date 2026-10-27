import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useTvBack } from "../components/TvFocus";
import {
  backdropUrl,
  posterUrl,
  type Video,
  type WatchProvider,
} from "../lib/tmdb";
import { VIDEO_TYPES } from "../lib/titleFacts";
import { dateLabel } from "../lib/format";

/**
 * The parts of a title's TV screen beyond the essentials: what the phone
 * shows in sections, made for a remote — focusable cards in lanes.
 */

export type RatingTile = {
  label: string;
  /** undefined while loading; null — the source has no score. */
  value: string | null | undefined;
  sub?: string | null;
  color: string;
};

/** Scores of IMDb, TMDB, Rotten Tomatoes and Metacritic, two by two. */
export function RatingTiles({ tiles }: { tiles: RatingTile[] }) {
  const shown = tiles.filter((t) => t.value !== null);
  if (!shown.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {shown.map((t) => (
        <div key={t.label} className="rounded-2xl bg-black/60 px-3 py-2">
          <p className="text-[11px] text-white/60">{t.label}</p>
          {t.value === undefined ? (
            <span className="mt-1 block h-6 w-12 animate-pulse rounded bg-white/10" />
          ) : (
            <p
              className="font-mono text-[22px] font-bold leading-7"
              style={{ color: t.color }}
            >
              {t.value}
            </p>
          )}
          <p className="h-4 truncate font-mono text-[11px] text-white/45">
            {t.value ? t.sub || "" : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

export const VIDEO_STEP = 216;

export const VideoCard = memo(function VideoCard({
  video,
  focused,
}: {
  video: Video;
  focused: boolean;
}) {
  return (
    <div className="w-[200px] shrink-0" data-focused={focused || undefined}>
      <div
        className={`relative aspect-video overflow-hidden rounded-xl bg-card transition-transform duration-150 ${
          focused ? "z-10 scale-105 shadow-[0_0_0_3px_var(--color-accent)]" : ""
        }`}
      >
        <img
          src={`https://i.ytimg.com/vi/${video.key}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <span
          aria-hidden="true"
          className={`absolute inset-0 m-auto flex h-10 w-10 items-center justify-center rounded-full text-[15px] transition-colors ${
            focused ? "bg-accent text-black" : "bg-black/60 text-white"
          }`}
        >
          ▶
        </span>
      </div>
      <p
        className={`mt-2 line-clamp-2 text-[13px] leading-tight ${focused ? "text-ink" : "text-mute"}`}
      >
        {video.name}
      </p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-dim">
        {VIDEO_TYPES[video.type] || video.type}
        {video.iso_639_1 ? ` · ${video.iso_639_1}` : ""}
      </p>
    </div>
  );
});

export const STILL_STEP = 272;

/** A still from the film; in focus it also fills the screen behind. */
export const Still = memo(function Still({
  path,
  focused,
}: {
  path: string;
  focused: boolean;
}) {
  return (
    <div className="w-[256px] shrink-0" data-focused={focused || undefined}>
      <img
        src={backdropUrl(path, "w780")}
        alt=""
        loading="lazy"
        className={`aspect-video w-full rounded-xl bg-card object-cover transition-transform duration-150 ${
          focused
            ? "relative z-10 scale-105 shadow-[0_0_0_3px_var(--color-accent)]"
            : ""
        }`}
      />
    </div>
  );
});

/** A streaming service, rental or purchase: logo, name, how. */
export const PROVIDER_STEP = 226;

export const Provider = memo(function Provider({
  provider,
  how,
  focused,
  opens,
}: {
  provider: WatchProvider;
  how: string;
  focused: boolean;
  /** OK opens its app on this TV. */
  opens: boolean;
}) {
  return (
    <span
      data-focused={focused || undefined}
      className={`flex h-12 w-[210px] shrink-0 items-center gap-2.5 rounded-2xl py-1 pl-1.5 pr-3 transition-[transform,background-color,color] duration-150 ${
        focused ? "scale-105 bg-ink text-canvas" : "bg-white/10 text-ink"
      }`}
    >
      {provider.logo_path ? (
        <img
          src={posterUrl(provider.logo_path, "w92")}
          alt=""
          className="h-9 w-9 rounded-xl"
        />
      ) : null}
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[14px]">
          {provider.provider_name}
        </span>
        <span
          className={`block text-[11px] ${focused ? "text-black/60" : "text-white/50"}`}
        >
          {opens ? `${how} · OK — відкрити` : how}
        </span>
      </span>
    </span>
  );
});

/** The facts of a title in two columns. */
export function Facts({
  rows,
  focused,
}: {
  rows: Array<[string, string]>;
  focused: boolean;
}) {
  return (
    <div
      data-focused={focused || undefined}
      className={`mx-12 grid grid-cols-2 gap-x-8 rounded-2xl px-5 py-3 transition-colors duration-200 ${
        focused
          ? "bg-white/[0.12] shadow-[0_0_0_2px_var(--color-accent)]"
          : "bg-white/[0.06]"
      }`}
    >
      {rows.map(([label, value]) => (
        <div key={label} className="py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
            {label}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

export type Review = {
  id: string;
  author: string;
  content: string;
  created_at?: string;
  author_details?: { rating?: number | null };
};

export const REVIEW_STEP = 332;

export const ReviewCard = memo(function ReviewCard({
  review,
  focused,
}: {
  review: Review;
  focused: boolean;
}) {
  const rating = review.author_details?.rating;
  return (
    <div
      data-focused={focused || undefined}
      className={`h-[176px] w-[316px] shrink-0 rounded-2xl p-4 transition-[transform,background-color] duration-150 ${
        focused
          ? "scale-[1.03] bg-white/[0.14] shadow-[0_0_0_3px_var(--color-accent)]"
          : "bg-white/[0.07]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[14px]">{review.author}</p>
        <p className="shrink-0 font-mono text-[11px] text-white/50">
          {rating ? <span className="text-accent">{rating}/10 · </span> : null}
          {review.created_at ? dateLabel(review.created_at.slice(0, 10)) : ""}
        </p>
      </div>
      <p
        lang="en"
        className="mt-2 line-clamp-5 text-[13px] leading-snug text-white/80"
      >
        {review.content}
      </p>
    </div>
  );
});

/**
 * A long text over the screen (a review): up/down scroll it, OK or Back
 * close it. It takes the keys while open — the lanes below stay put.
 */
export function Reader({
  title,
  sub,
  text,
  onClose,
}: {
  title: string;
  sub?: string;
  text: string;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  useTvBack(true, onClose);
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);
  const room = () =>
    Math.max(
      0,
      (body.current?.scrollHeight ?? 0) -
        (body.current?.parentElement?.clientHeight ?? 0),
    );
  return (
    <div
      ref={box}
      tabIndex={-1}
      data-tv-own-keys=""
      role="dialog"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const step = e.key === "ArrowDown" ? 120 : -120;
          setOffset((o) => Math.min(room(), Math.max(0, o + step)));
        } else if (e.key === "Enter" || e.key === "Escape") onClose();
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      className="tv-fade fixed inset-0 z-40 flex flex-col bg-black/[0.97] px-24 pb-10 pt-12 outline-none"
    >
      <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-accent">
        рецензія
      </p>
      <h2 className="mt-1 text-[26px] tracking-tight">{title}</h2>
      {sub ? <p className="text-[13px] text-white/50">{sub}</p> : null}
      <div className="relative mt-5 min-h-0 flex-1 overflow-hidden">
        <div
          ref={body}
          lang="en"
          className="whitespace-pre-line text-[17px] leading-relaxed text-white/85 transition-transform duration-200"
          style={{ transform: `translate3d(0, ${-offset}px, 0)` }}
        >
          {text}
        </div>
      </div>
      <p className="mt-4 text-[12px] text-white/40">
        ▲▼ — гортати · OK або «Назад» — закрити
      </p>
    </div>
  );
}

/** A small heading over a part of the screen that is not a rail. */
export function PartTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 px-12 text-[17px] font-medium tracking-tight">
      {children}
    </h2>
  );
}
