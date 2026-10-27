import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BrandLockup } from "../components/Brand";
import { RatingBadge } from "../components";
import { backdropUrl } from "../lib/tmdb";
import type { Card } from "./cards";
import type { Lane } from "./lanes";

/**
 * Building blocks of the TV screens. The WebView is 960×540 CSS px; nothing
 * scrolls — lanes slide with transforms, which the TV's GPU does smoothly.
 */

export const PAD = 48;
const VISIBLE = 960 - PAD * 2;

/** The whole screen. */
export function Stage({
  screen,
  children,
}: {
  /** Which screen this is (the tab's path), for tests and debugging. */
  screen?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-screen={screen}
      className="tv-stage fixed inset-0 overflow-hidden bg-canvas text-ink"
    >
      {children}
    </div>
  );
}

/** Full-screen picture of the focused title, faded in, darkened on the left. */
export const Backdrop = memo(function Backdrop({
  path,
  dim = 0.85,
}: {
  path?: string | null;
  dim?: number;
}) {
  const url = path ? backdropUrl(path, "w1280") : "";
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {url ? (
        <img
          key={url}
          src={url}
          alt=""
          className="tv-fade h-full w-full object-cover"
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(90deg, rgba(0,0,0,${dim}) 0%, rgba(0,0,0,${dim * 0.9}) 32%, rgba(0,0,0,0.25) 70%, rgba(0,0,0,0.1) 100%)`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent to-60%" />
    </div>
  );
});

export const TABS = [
  { to: "/", label: "Стрічка" },
  { to: "/search", label: "Пошук" },
  { to: "/tonight", label: "На вечір" },
  { to: "/library", label: "Колекція" },
  { to: "/settings", label: "Профіль" },
] as const;

/**
 * The menu as a lane of a tab's screen: left/right opens the next tab with
 * no OK, and that screen starts with the remote on the menu.
 */
export function useMenu(tab: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const index = Math.max(
    0,
    TABS.findIndex((t) => t.to === tab),
  );
  const lane: Lane = {
    key: "tabs",
    size: TABS.length,
    onMove: (i) => (i === index ? openNone() : openSoon(navigate, i)),
    onLeave: openNow,
  };
  useEffect(() => openNone, []);
  const arrived = Boolean((location.state as { menu?: boolean } | null)?.menu);
  // Only this time: Back to the screen later finds it as it was left.
  useEffect(() => {
    const entry = window.history.state as { usr?: unknown } | null;
    if (arrived && entry?.usr)
      window.history.replaceState({ ...entry, usr: null }, "");
  }, []);
  return {
    lane,
    index,
    /** Opened from the menu (not by Back to it): the remote stays there. */
    arrived,
  };
}

const go = (navigate: ReturnType<typeof useNavigate>, i: number) =>
  navigate(TABS[i].to, { replace: true, state: { menu: true } });

/**
 * The tab the remote went to opens once the blob has flowed there: a new
 * screen keeps the TV busy for a moment, and the blob would stall on its
 * way. Quick presses skip the tabs in between.
 */
let pending: { timer: number; open: () => void } | null = null;

function openSoon(navigate: ReturnType<typeof useNavigate>, i: number) {
  openNone();
  const open = () => {
    pending = null;
    go(navigate, i);
  };
  pending = { timer: window.setTimeout(open, 260), open };
}

/** Down from the menu: the chosen tab opens right away. */
function openNow() {
  if (!pending) return;
  window.clearTimeout(pending.timer);
  pending.open();
}

function openNone() {
  if (pending) window.clearTimeout(pending.timer);
  pending = null;
}

/** Where the blob was when the last menu left the screen: the next one flows on from there. */
let lastBlob: Edges | null = null;
type Edges = { left: number; right: number };

/**
 * The top menu. A drop of light marks the tab: it flows to the next one,
 * stretching ahead and pulling its tail after (no blur filter: the TV's GPU
 * drops frames on it), and lights up while the remote is on the menu. On screens of lanes `focus` says which tab has the
 * remote; on ordinary pages (`links`) the tabs are links the spatial
 * navigation moves between, and a tab opens as soon as it gets focus.
 */
export function Tabs({
  active,
  focus = null,
  links = false,
}: {
  active: string;
  focus?: number | null;
  links?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useRef<HTMLElement>(null);
  const [linkFocus, setLinkFocus] = useState<number | null>(null);
  const at = links ? linkFocus : focus;
  const target = at ?? TABS.findIndex((t) => t.to === active);
  const lit = at !== null;
  const [edges, setEdges] = useState<Edges[]>([]);
  const [blob, setBlob] = useState<Edges | null>(null);
  const [moves, setMoves] = useState(0);
  const toRight = useRef(true);
  const drop = useRef<HTMLSpanElement>(null);

  // Where each tab is: read once (and when the font arrives), not per key.
  useLayoutEffect(() => {
    const measure = () => {
      const items = nav.current?.querySelectorAll<HTMLElement>("[data-tab]");
      if (items)
        setEdges(
          Array.from(items, (el) => ({
            left: el.offsetLeft,
            right: el.offsetLeft + el.offsetWidth,
          })),
        );
    };
    measure();
    void document.fonts?.ready.then(measure);
    // The menu of the screen before has just gone: start where it was.
    setBlob(lastBlob);
  }, []);

  useEffect(() => {
    const next = edges[target];
    if (!next) return;
    const frame = requestAnimationFrame(() => {
      // Styles settle where the blob is now, so the move below transitions.
      if (drop.current) void getComputedStyle(drop.current).left;
      setBlob((b) => {
        if (b && b.left === next.left && b.right === next.right) return b;
        toRight.current = !b || next.left >= b.left;
        if (b) setMoves((n) => n + 1);
        return next;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [edges, target]);

  // Leaving, the blob may be on its way: the next menu starts from where
  // it is seen, not from where it was going.
  useLayoutEffect(
    () => () => {
      const el = drop.current;
      if (!el) return;
      const style = getComputedStyle(el);
      lastBlob = {
        left: parseFloat(style.left),
        right: el.parentElement!.clientWidth - parseFloat(style.right),
      };
    },
    [],
  );

  // A tab page opened from the menu: the remote stays on its tab.
  useLayoutEffect(() => {
    if (!links || !(location.state as { menu?: boolean } | null)?.menu) return;
    nav.current
      ?.querySelector<HTMLElement>(`[data-tab="${active}"]`)
      ?.focus({ preventScroll: true });
  }, []);

  // The edge ahead runs, the one behind follows: the drop stretches and
  // gathers again at the new tab.
  const fast = "220ms cubic-bezier(0.3, 0.9, 0.3, 1)";
  const slow = "300ms cubic-bezier(0.5, 0, 0.2, 1) 30ms";
  const [l, r] = toRight.current ? [slow, fast] : [fast, slow];
  return (
    <header
      className={`${links ? "relative" : "absolute inset-x-0 top-0"} z-20 flex h-16 items-center gap-6 px-12`}
    >
      <span className="w-[118px] shrink-0 overflow-hidden">
        <span className="block origin-left scale-75">
          <BrandLockup />
        </span>
      </span>
      <nav ref={nav} className="relative isolate flex items-center gap-1">
        {blob ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{ opacity: lit ? 1 : 0.16 }}
          >
            <span
              ref={drop}
              className={`absolute inset-y-0 rounded-full bg-ink ${
                moves ? (moves % 2 ? "tv-blob-a" : "tv-blob-b") : ""
              }`}
              style={{
                left: blob.left,
                right: `calc(100% - ${blob.right}px)`,
                transition: `left ${l}, right ${r}`,
              }}
            />
          </div>
        ) : null}
        {TABS.map((t, i) => {
          const on = at === i;
          const className = `relative rounded-full px-4 py-1.5 text-[15px] outline-none ${
            on || t.to === active ? "text-ink" : "text-mute"
          }`;
          // Light letters turn dark exactly where the blob runs under them.
          const style = { mixBlendMode: "difference" as const };
          return links ? (
            <Link
              key={t.to}
              to={t.to}
              replace
              data-tab={t.to}
              className={className}
              style={style}
              onFocus={() => {
                setLinkFocus(i);
                if (t.to === active) openNone();
                else openSoon(navigate, i);
              }}
              onBlur={() => {
                setLinkFocus(null);
                // Off the menu (not to the next tab): open the chosen one now.
                window.setTimeout(() => {
                  if (!nav.current?.contains(document.activeElement)) openNow();
                }, 0);
              }}
            >
              {t.label}
            </Link>
          ) : (
            <span
              key={t.to}
              data-tab={t.to}
              data-focused={on || undefined}
              className={className}
              style={style}
            >
              {t.label}
            </span>
          );
        })}
      </nav>
    </header>
  );
}

/**
 * A column of lanes that slides so the focused lane sits at `anchor` px from
 * the top; lanes above it fade out when `hideAbove` is set.
 */
export function LaneStack({
  focus,
  anchor,
  top,
  children,
}: {
  focus: string | null;
  anchor: number;
  /** Where the stack starts on screen. */
  top: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  // Measured when the focus moves or the lanes change size (a row loads),
  // not on every key: reading layout is what makes a TV stutter.
  useLayoutEffect(() => {
    const stack = ref.current;
    if (!stack) return;
    const measure = () => {
      const el = stack.querySelector<HTMLElement>(`[data-lane="${focus}"]`);
      if (el) setShift(Math.max(0, el.offsetTop + top - anchor));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stack);
    return () => observer.disconnect();
  }, [focus, anchor, top]);
  return (
    <div
      ref={ref}
      className="absolute inset-x-0 transition-transform duration-300 ease-out"
      style={{ top, transform: `translate3d(0, ${-shift}px, 0)` }}
    >
      {children}
    </div>
  );
}

/**
 * A horizontal lane: the track slides so the focused item stays at the left,
 * until the end of the lane comes into view.
 */
export function Rail({
  lane,
  title,
  count,
  step,
  col,
  dim,
  children,
}: {
  lane: string;
  title?: string;
  count: number;
  /** Item width plus the gap. */
  step: number;
  col: number;
  /** A lane above the focused one, out of the way of the hero. */
  dim?: boolean;
  children: ReactNode;
}) {
  const end = Math.max(0, count * step - itemGap(step) - VISIBLE);
  const shift = Math.min(col * step, end);
  return (
    <section
      data-lane={lane}
      className={`pb-5 transition-opacity duration-300 ${dim ? "opacity-0" : "opacity-100"}`}
    >
      {title ? (
        <h2 className="mb-2 px-12 text-[17px] font-medium tracking-tight">
          {title}
        </h2>
      ) : null}
      <div
        className="flex px-12 py-2 transition-transform duration-200 ease-out will-change-transform"
        style={{
          gap: itemGap(step),
          transform: `translate3d(${-shift}px, 0, 0)`,
        }}
      >
        {children}
      </div>
    </section>
  );
}

const itemGap = (step: number) => (step >= 200 ? 16 : 14);

export const POSTER_STEP = 118;

/** A poster on a row. Focus: grows and gets the accent frame. */
export const Poster = memo(function Poster({
  card,
  focused,
  caption = false,
}: {
  card: Card;
  focused: boolean;
  /** Title under the poster (screens without the big title on top). */
  caption?: boolean | "year";
}) {
  return (
    <div className="w-[104px] shrink-0" data-focused={focused || undefined}>
      <div
        className={`relative h-[156px] overflow-hidden rounded-xl bg-card transition-transform duration-150 ease-out ${
          focused
            ? "z-10 scale-110 shadow-[0_0_0_3px_var(--color-accent),0_14px_30px_rgba(0,0,0,0.7)]"
            : ""
        }`}
      >
        {card.poster ? (
          <img
            src={card.poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <p className="p-2 text-sm text-mute">{card.title}</p>
        )}
        {/* IMDb, loaded once the poster is on screen. */}
        <RatingBadge type={card.type} id={card.id} />
        {card.badge ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-accent px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-black">
            {card.badge}
          </span>
        ) : null}
      </div>
      {caption ? (
        <p
          className={`mt-2.5 line-clamp-2 text-[13px] leading-tight ${focused ? "text-ink" : "text-mute"}`}
        >
          {card.title}
          {caption === "year" && card.year ? (
            <span className="text-dim"> · {card.year}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
});

/** A button in a lane of actions. Focus: white, like the TV's own menus. */
export const Pill = memo(function Pill({
  focused,
  accent,
  wide,
  children,
}: {
  focused: boolean;
  accent?: boolean;
  /** Fills its slot (pills of a rail have equal width). */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      data-focused={focused || undefined}
      className={`${wide ? "flex w-full justify-center" : "inline-flex"} h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] transition-[transform,background-color,color] duration-150 ${
        focused
          ? "scale-105 bg-ink text-canvas"
          : accent
            ? "bg-accent/90 text-black"
            : "bg-white/10 text-ink"
      }`}
    >
      {children}
    </span>
  );
});

/** A lane of pills (actions, seasons, a rating). */
export function PillLane({
  lane,
  title,
  children,
}: {
  lane: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section data-lane={lane} className="px-12 pb-5">
      {title ? <h2 className="mb-2 text-[15px] text-mute">{title}</h2> : null}
      <div className="flex flex-wrap gap-3">{children}</div>
    </section>
  );
}

export const PERSON_STEP = 112;

export const Person = memo(function Person({
  name,
  role,
  photo,
  focused,
}: {
  name: string;
  role?: string;
  photo?: string | null;
  focused: boolean;
}) {
  return (
    <div
      className="w-[98px] shrink-0 text-center"
      data-focused={focused || undefined}
    >
      <div
        className={`mx-auto h-[88px] w-[88px] overflow-hidden rounded-full bg-card transition-transform duration-150 ${
          focused ? "scale-110 shadow-[0_0_0_3px_var(--color-accent)]" : ""
        }`}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-2xl text-dim">
            {name.slice(0, 1)}
          </span>
        )}
      </div>
      <p
        className={`mt-2.5 line-clamp-2 text-[13px] leading-tight ${focused ? "text-ink" : "text-mute"}`}
      >
        {name}
      </p>
      {role ? (
        <p className="mt-0.5 line-clamp-1 text-[11px] text-dim">{role}</p>
      ) : null}
    </div>
  );
});

export const EPISODE_STEP = 216;

export const Episode = memo(function Episode({
  number,
  name,
  still,
  watched,
  focused,
}: {
  number: number;
  name: string;
  still?: string | null;
  watched: boolean;
  focused: boolean;
}) {
  return (
    <div className="w-[200px] shrink-0" data-focused={focused || undefined}>
      <div
        className={`relative aspect-video overflow-hidden rounded-xl bg-card transition-transform duration-150 ${
          focused ? "z-10 scale-105 shadow-[0_0_0_3px_var(--color-accent)]" : ""
        }`}
      >
        {still ? (
          <img
            src={still}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : null}
        {watched ? (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-ok px-2 py-0.5 text-[11px] font-bold text-black">
            ✓ переглянуто
          </span>
        ) : null}
      </div>
      <p
        className={`mt-2 line-clamp-2 text-[13px] leading-tight ${focused ? "text-ink" : "text-mute"}`}
      >
        {number}. {name}
      </p>
    </div>
  );
});
