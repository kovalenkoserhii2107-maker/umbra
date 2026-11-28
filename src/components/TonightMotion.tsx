import { useEffect, useRef, useState } from "react";
import type { LibraryItem } from "../lib/library";
import { correctPosterUrl } from "../lib/tmdb";

/** The person's favourite posters, for the show. */
export function libraryPosters(items: LibraryItem[], n = 6) {
  return items
    .filter((x) => x.poster && x.status !== "dropped")
    .sort(
      (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.updatedAt - a.updatedAt,
    )
    .slice(0, n)
    .map((x) => correctPosterUrl(x.poster));
}

/*
 * Motion for the evening picker on the web: a question that writes itself
 * in, answers that rise one by one, the chosen one glowing as the rest step
 * back, and a short eclipse show while the picks are gathered. Everything
 * stands still for people who ask for less motion.
 */

export const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** A title whose words rise in one after another. */
export function Words({ text, step = 45 }: { text: string; step?: number }) {
  return (
    <span aria-label={text}>
      {text.split(" ").map((word, i) => (
        <span
          key={`${word}-${i}`}
          aria-hidden="true"
          className="q-word"
          style={{ animationDelay: `${i * step}ms` }}
        >
          {word}
          {" "}
        </span>
      ))}
    </span>
  );
}

/** True while `active`, and on for at least `ms` once it starts. */
export function useLingering(active: boolean, ms = 2000) {
  const [hold, setHold] = useState(active);
  const since = useRef(active ? Date.now() : 0);
  useEffect(() => {
    if (active) {
      since.current = Date.now();
      setHold(true);
      return;
    }
    if (!hold) return;
    const left = reducedMotion() ? 0 : ms - (Date.now() - since.current);
    if (left <= 0) {
      setHold(false);
      return;
    }
    const timer = window.setTimeout(() => setHold(false), left);
    return () => window.clearTimeout(timer);
  }, [active, hold, ms]);
  return active || hold;
}

const LINES = {
  ask: [
    "Дивлюся на твої відповіді",
    "Шукаю, що ще варто уточнити",
    "Формулюю питання",
  ],
  pick: [
    "Читаю твої оцінки",
    "Зважую жанри, режисерів і настрій",
    "Шукаю приховані перлини",
    "Відбираю найкраще",
  ],
  "ai-pick": [
    "Claude вивчає твою полицю",
    "Зіставляє відповіді зі смаком",
    "Перевіряє, де це подивитися",
    "Збирає добірку",
  ],
} as const;

/**
 * The eclipse show: a halo with the moon's shadow drifting over it, the
 * person's own posters orbiting and falling into the light, and a line that
 * says what is going on.
 */
export function Thinking({
  kind,
  posters = [],
  note,
}: {
  kind: keyof typeof LINES;
  posters?: string[];
  note?: string;
}) {
  const lines = LINES[kind];
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const timer = window.setInterval(
      () => setN((x) => Math.min(x + 1, lines.length - 1)),
      kind === "ai-pick" ? 2600 : 520,
    );
    return () => window.clearInterval(timer);
  }, [kind, lines.length]);
  const sats = posters.length
    ? posters.slice(0, 6)
    : Array.from({ length: 6 }, () => "");
  return (
    <section
      role="status"
      aria-live="polite"
      className="rise mt-8 flex flex-col items-center text-center"
    >
      <div className="pk-stage" aria-hidden="true">
        <div className="pk-glow" />
        <div className="pk-orbit">
          {sats.map((src, i) => (
            <div
              key={i}
              className="pk-arm"
              style={{ transform: `rotate(${(360 / sats.length) * i}deg)` }}
            >
              <div
                className="pk-sat"
                style={{ animationDelay: `${i * 0.33}s` }}
              >
                {src ? <img src={src} alt="" /> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="pk-halo" />
        <div className="pk-disc" />
      </div>
      <p key={n} className="rise mt-5 text-base">
        {lines[n]}…
      </p>
      <div className="mt-3 flex gap-1.5" aria-hidden="true">
        {lines.map((line, i) => (
          <span
            key={line}
            className={`h-1 rounded-full transition-all duration-500 ${i <= n ? "w-6 bg-accent" : "w-3 bg-hairline"}`}
          />
        ))}
      </div>
      {note ? <p className="mt-3 text-xs text-mute">{note}</p> : null}
    </section>
  );
}
