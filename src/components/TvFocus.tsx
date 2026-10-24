import { useEffect, useLayoutEffect } from "react";
import { isTv, pushTvBack } from "../lib/tvMode";
import { defaultFocus, focusInto, focusables } from "../lib/spatial";

/** Where focus was on each screen, to return to it with Back. */
const places = new Map<string, { sign: string; index: number }>();

/** Rows load in any order: an element is found again by its link or label. */
function signOf(el: Element) {
  return (
    el.getAttribute("href") ||
    el.getAttribute("aria-label") ||
    (el.textContent || "").trim().slice(0, 80)
  );
}

/**
 * On a new screen focus lands on its main element once it renders; coming
 * back, on the element that had it. Focus left in the header stays there.
 */
export function useTvScreenFocus(screen: string) {
  useEffect(() => {
    if (!isTv) return;
    const main = document.querySelector("main");
    if (!main) return;
    const saved = places.get(screen);
    /** What this hook focused itself; it may move on as the screen fills in. */
    let placed: Element | null = null;
    let pressed = false;
    const settle = () => {
      if (pressed) return;
      const active = document.activeElement;
      const free =
        !active ||
        active === document.body ||
        active === placed ||
        !document.contains(active);
      if (!free) return;
      // A placeholder for the screen's main block: wait for it.
      if (main.querySelector("[data-tv-wait]")) return;
      let target: HTMLElement | null;
      if (saved) {
        // Wait until that element is back; the same title may sit in several
        // rows, so take the one nearest its old place.
        const list = focusables(main);
        const same = list.filter((el) => signOf(el) === saved.sign);
        target = same.length
          ? same.reduce((a, b) =>
              Math.abs(list.indexOf(b) - saved.index) <
              Math.abs(list.indexOf(a) - saved.index)
                ? b
                : a,
            )
          : null;
      } else target = defaultFocus();
      if (!target || target === active) return;
      placed = target;
      // The screen opens at its top unless the element is out of view.
      const box = target.getBoundingClientRect();
      if (saved || box.bottom > window.innerHeight) focusInto(target, "center");
      else target.focus({ preventScroll: true });
    };
    // Once the remote is used, focus is the user's.
    const onKey = () => {
      pressed = true;
    };
    window.addEventListener("keydown", onKey, true);
    const remember = (event: FocusEvent) => {
      const el = event.target as HTMLElement;
      const index = focusables(main).indexOf(el);
      if (index >= 0) places.set(screen, { sign: signOf(el), index });
    };
    // Lazy screens and data arrive later: try again as the page fills in.
    const observer = new MutationObserver(settle);
    observer.observe(main, { childList: true, subtree: true });
    const stop = window.setTimeout(() => observer.disconnect(), 5000);
    settle();
    main.addEventListener("focusin", remember);
    return () => {
      observer.disconnect();
      window.clearTimeout(stop);
      window.removeEventListener("keydown", onKey, true);
      main.removeEventListener("focusin", remember);
    };
  }, [screen]);
}

/** While `open`, the remote's Back calls `close` instead of leaving the screen. */
export function useTvBack(open: boolean, close: () => void) {
  // Before the screen is painted: Back must work as soon as it is seen.
  useLayoutEffect(() => {
    if (!isTv || !open) return;
    return pushTvBack(close);
  }, [open, close]);
}
