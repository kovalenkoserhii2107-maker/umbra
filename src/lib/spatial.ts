/**
 * Spatial navigation for the TV remote: arrows move focus to the nearest
 * element in that direction, OK (Enter) activates it.
 */

export type Box = { left: number; top: number; right: number; bottom: number };
export type Direction = "left" | "right" | "up" | "down";

const DIRECTIONS: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** Extra distance for a box out of line: about a screen of the TV page. */
const OUT_OF_LINE = 400;

/** Gap between two ranges on one axis; 0 when they overlap. */
function apart(a1: number, a2: number, b1: number, b2: number) {
  if (b2 < a1) return a1 - b2;
  if (b1 > a2) return b1 - a2;
  return 0;
}

/**
 * Index of the box to move to from `from`, or -1. A candidate must lie
 * further in the direction (its centre past ours, overlapping us by at most
 * a quarter, half for up/down). Nearest wins; boxes out of line pay extra, so
 * rows and columns are followed before diagonals.
 */
export function nextIndex(from: Box, boxes: Box[], dir: Direction): number {
  const horizontal = dir === "left" || dir === "right";
  const cx = (from.left + from.right) / 2;
  const cy = (from.top + from.bottom) / 2;
  let best = -1;
  let bestScore = Infinity;
  boxes.forEach((b, i) => {
    if (b === from) return;
    const bx = (b.left + b.right) / 2;
    const by = (b.top + b.bottom) / 2;
    let gap: number;
    let ahead: boolean;
    let overlapLimit: number;
    if (dir === "right") {
      gap = b.left - from.right;
      ahead = bx > cx + 1;
    } else if (dir === "left") {
      gap = from.left - b.right;
      ahead = bx < cx - 1;
    } else if (dir === "down") {
      gap = b.top - from.bottom;
      ahead = by > cy + 1;
    } else {
      gap = from.top - b.bottom;
      ahead = by < cy - 1;
    }
    if (horizontal)
      overlapLimit = Math.min(from.right - from.left, b.right - b.left) / 4;
    else overlapLimit = Math.min(from.bottom - from.top, b.bottom - b.top) / 2;
    if (!ahead || gap < -overlapLimit) return;
    const offset = horizontal
      ? apart(from.top, from.bottom, b.top, b.bottom)
      : apart(from.left, from.right, b.left, b.right);
    // Among boxes in line, the one closest to our centre.
    const centre = horizontal ? Math.abs(by - cy) : Math.abs(bx - cx);
    const score =
      Math.max(gap, 0) + (offset ? OUT_OF_LINE + offset * 3 : 0) + centre / 100;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

// ---- DOM ----

const FOCUSABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]';

function usable(el: HTMLElement) {
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.tabIndex < 0) return false;
  if (el.closest("[inert], [aria-hidden='true'], [data-tv-skip]")) return false;
  if (!el.getClientRects().length) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

/** What the user sees for an element: a visually hidden checkbox → its label. */
function boxOf(el: HTMLElement): DOMRect {
  const rect = el.getBoundingClientRect();
  if (rect.width * rect.height >= 16) return rect;
  return (el.closest("label") ?? el).getBoundingClientRect();
}

export function focusables(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    usable,
  );
}

/** Text fields keep left/right while the caret can still move. */
function caretCanMove(el: Element, dir: Direction) {
  if (el instanceof HTMLTextAreaElement && (dir === "up" || dir === "down")) {
    const at = dir === "up" ? 0 : el.value.length;
    return el.selectionStart !== at;
  }
  if (
    !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ||
    el.readOnly
  )
    return false;
  if (dir !== "left" && dir !== "right") return false;
  try {
    const { selectionStart: s, selectionEnd: e, value } = el;
    if (s === null) return false;
    return dir === "left" ? s > 0 || e !== s : e! < value.length || e !== s;
  } catch {
    return false;
  }
}

/** Rows of posters remember their item, like the rows of a TV home screen. */
const ROW = ".row-scroll, [data-tv-row]";
const rowItems = new WeakMap<Element, HTMLElement>();

/** Entering a row from above or below: its remembered item, else the first in view. */
function entryOf(row: Element, all: HTMLElement[]) {
  const kept = rowItems.get(row);
  if (kept?.isConnected && all.includes(kept)) return kept;
  const left = row.getBoundingClientRect().left;
  const items = all.filter((el) => row.contains(el));
  return items.find((el) => boxOf(el).left >= left - 1) ?? items[0];
}

export function move(dir: Direction): boolean {
  const active = document.activeElement as HTMLElement | null;
  const all = focusables();
  if (!active || active === document.body || !all.includes(active)) {
    const first = defaultFocus();
    if (!first) return false;
    focusInto(first, "center");
    return true;
  }
  const boxes = all.map(boxOf);
  const from = boxes[all.indexOf(active)];
  const index = nextIndex(from, boxes, dir);
  if (index < 0) return false;
  const box = boxes[index];
  // Far off screen: scroll towards it first, so text in between can be read.
  const vertical = dir === "up" || dir === "down";
  const step = window.innerHeight * 0.6;
  const gap = dir === "down" ? box.top - from.bottom : from.top - box.bottom;
  const offscreen =
    dir === "down" ? box.top > window.innerHeight : box.bottom < 0;
  if (vertical && offscreen && gap > step) {
    window.scrollBy({ top: dir === "down" ? step : -step, behavior: "smooth" });
    return true;
  }
  let target = all[index];
  const row = target.closest(ROW);
  if (vertical && row && !row.contains(active))
    target = entryOf(row, all) ?? target;
  focusInto(target, vertical ? "center" : "nearest");
  return true;
}

export function focusInto(el: HTMLElement, block: ScrollLogicalPosition) {
  el.focus({ preventScroll: true });
  // The header row: back to the top of the page.
  if (el.closest("header")) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  el.scrollIntoView({ block, inline: "nearest", behavior: "smooth" });
}

/** Where focus lands on a new screen. */
export function defaultFocus(): HTMLElement | null {
  const main = document.querySelector("main") ?? document.body;
  const marked = Array.from(
    main.querySelectorAll<HTMLElement>("[data-tv-autofocus]"),
  ).find(usable);
  if (marked) return marked;
  const list = focusables(main);
  // The first element in view, not one scrolled away.
  return list.find((el) => boxOf(el).bottom > 70) ?? list[0] ?? null;
}

export function startSpatialNav() {
  const onKey = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const active = document.activeElement;
    const dir = DIRECTIONS[event.key];
    if (dir) {
      if (active && caretCanMove(active, dir)) return;
      if (move(dir)) event.preventDefault();
      return;
    }
    // OK on a checkbox or switch toggles it, like a click.
    if (
      event.key === "Enter" &&
      active instanceof HTMLInputElement &&
      (active.type === "checkbox" || active.type === "radio")
    ) {
      event.preventDefault();
      active.click();
    }
  };
  const onFocus = (event: FocusEvent) => {
    const el = event.target as HTMLElement;
    const row = el.closest?.(ROW);
    if (row) rowItems.set(row, el);
  };
  window.addEventListener("keydown", onKey);
  document.addEventListener("focusin", onFocus);
  return () => {
    window.removeEventListener("keydown", onKey);
    document.removeEventListener("focusin", onFocus);
  };
}
