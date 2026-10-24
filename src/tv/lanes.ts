import { useEffect, useRef, useState } from "react";
import type { Direction } from "../lib/spatial";

/**
 * Focus on TV screens: the screen is a column of lanes (a row of buttons,
 * a row of posters…); up/down moves between lanes, left/right inside one.
 * Each lane remembers its position, like the rows of a TV home screen.
 * Lanes are known by key, so rows that load later do not move the focus.
 */
export type Lane = {
  key: string;
  size: number;
  /** OK on item `index`. */
  onSelect?: (index: number) => void;
};

export type LanesState = { lane: string | null; cols: Record<string, number> };

const clamp = (n: number, size: number) => Math.max(0, Math.min(n, size - 1));

/** The lane in focus: the current one if it still has items, else the nearest. */
export function settle(state: LanesState, lanes: Lane[]): LanesState {
  const live = lanes.filter((l) => l.size > 0);
  if (!live.length)
    return state.lane === null ? state : { ...state, lane: null };
  const index = lanes.findIndex((l) => l.key === state.lane);
  if (index >= 0 && lanes[index].size > 0) return state;
  // Gone or empty: the nearest lane below it, else above, else the first.
  const below =
    index >= 0 ? lanes.slice(index + 1).find((l) => l.size > 0) : null;
  const above =
    index >= 0
      ? [...lanes.slice(0, index)].reverse().find((l) => l.size > 0)
      : null;
  return { ...state, lane: (below ?? above ?? live[0]).key };
}

export function colOf(state: LanesState, lane: Lane) {
  return clamp(state.cols[lane.key] ?? 0, lane.size);
}

/** Where `dir` leads; null when there is nowhere to go. */
export function moveFocus(
  state: LanesState,
  lanes: Lane[],
  dir: Direction,
): LanesState | null {
  const index = lanes.findIndex((l) => l.key === state.lane);
  if (index < 0) return null;
  const lane = lanes[index];
  const col = colOf(state, lane);
  if (dir === "left" || dir === "right") {
    const next = col + (dir === "right" ? 1 : -1);
    if (next < 0 || next >= lane.size) return null;
    return { ...state, cols: { ...state.cols, [lane.key]: next } };
  }
  const step = dir === "down" ? 1 : -1;
  for (let i = index + step; i >= 0 && i < lanes.length; i += step)
    if (lanes[i].size > 0) return { ...state, lane: lanes[i].key };
  return null;
}

const DIRECTIONS: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/**
 * Remote control for a screen of lanes. Takes the arrow keys and OK before
 * the page-wide spatial navigation (src/lib/spatial.ts) sees them.
 */
/** Where focus was on each screen, to come back to it with Back. */
const memory = new Map<string, LanesState>();

/** A screen in history: its place in it (React Router's idx) and its path. */
export function screenKey(pathname: string) {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return `${idx ?? "-"} ${pathname}`;
}

export function useLanes(
  lanes: Lane[],
  initial: {
    lane?: string;
    cols?: Record<string, number>;
    /** The screen in history (location key): focus returns there with Back. */
    remember?: string;
  } = {},
) {
  const [state, setRaw] = useState<LanesState>(
    () =>
      (initial.remember && memory.get(initial.remember)) || {
        lane: initial.lane ?? null,
        cols: initial.cols ?? {},
      },
  );
  const setState = (next: LanesState | ((s: LanesState) => LanesState)) =>
    setRaw((s) => {
      const value = typeof next === "function" ? next(s) : next;
      if (initial.remember) memory.set(initial.remember, value);
      return value;
    });
  const current = settle(state, lanes);
  const ref = useRef({ state: current, lanes });
  ref.current = { state: current, lanes };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      // A text field or a dialog of the page keeps its keys.
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [data-tv-own-keys]"))
        return;
      const { state, lanes } = ref.current;
      const dir = DIRECTIONS[event.key];
      if (dir) {
        event.preventDefault();
        event.stopPropagation();
        const next = moveFocus(state, lanes, dir);
        if (next) setState(next);
        return;
      }
      if (event.key === "Enter") {
        const lane = lanes.find((l) => l.key === state.lane);
        if (!lane?.onSelect) return;
        event.preventDefault();
        event.stopPropagation();
        lane.onSelect(colOf(state, lane));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return {
    lane: current.lane,
    /** Position in the lane: the focused item, or the remembered one. */
    col: (key: string) => {
      const lane = lanes.find((l) => l.key === key);
      return lane ? colOf(current, lane) : 0;
    },
    isFocused: (key: string, index: number) => {
      if (current.lane !== key) return false;
      const lane = lanes.find((l) => l.key === key);
      return Boolean(lane) && colOf(current, lane!) === index;
    },
    focus: (lane: string, col?: number) =>
      setState((s) => ({
        lane,
        cols: col === undefined ? s.cols : { ...s.cols, [lane]: col },
      })),
    state: current,
  };
}
