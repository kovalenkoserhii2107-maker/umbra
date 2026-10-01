/**
 * The app does not zoom. Most browsers follow `user-scalable=no` and
 * `touch-action: manipulation`; Safari on iOS ignores the first for pinch, so
 * its gesture events are cancelled here. `maximum-scale=1` also stops iOS from
 * zooming into a focused input.
 */
export function blockZoom() {
  if (typeof document === "undefined") return;
  const stop = (event: Event) => event.preventDefault();
  for (const name of ["gesturestart", "gesturechange", "gestureend"])
    document.addEventListener(name, stop, { passive: false });
  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );
}
