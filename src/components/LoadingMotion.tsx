import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  HERO_SCENE_TIME,
  pickLoadingScene,
  renderLoadingSceneSvg,
  type LoadingKind,
  type LoadingSceneId,
} from "../lib/loadingScenes";

function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LoadingMotion({
  kind,
  label,
  compact = false,
  sceneOverride,
}: {
  kind: LoadingKind;
  label: string;
  compact?: boolean;
  sceneOverride?: LoadingSceneId;
}) {
  const [picked] = useState<LoadingSceneId>(() => pickLoadingScene(kind));
  const scene = sceneOverride ?? picked;

  const rawId = useId();
  const uid = useMemo(
    () => "lm-" + rawId.replace(/[^a-zA-Z0-9_-]/g, ""),
    [rawId],
  );

  const [reduced, setReduced] = useState<boolean>(prefersReducedMotion);
  const groupRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const initialMarkup = useMemo(
    () => ({
      __html: renderLoadingSceneSvg(
        scene,
        reduced ? HERO_SCENE_TIME[scene] : 0,
        uid,
      ),
    }),
    [scene, reduced, uid],
  );

  useEffect(() => {
    if (reduced) {
      if (groupRef.current) {
        groupRef.current.innerHTML = renderLoadingSceneSvg(
          scene,
          HERO_SCENE_TIME[scene],
          uid,
        );
      }
      return;
    }

    let frame = 0;
    let accum = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (typeof document === "undefined" || !document.hidden) {
        accum += dt;
        if (groupRef.current) {
          groupRef.current.innerHTML = renderLoadingSceneSvg(scene, accum, uid);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, reduced, uid]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rise flex flex-col items-center justify-center text-center select-none ${
        compact ? "px-3 py-3" : ""
      }`}
    >
      <svg
        viewBox="0 0 240 108"
        fill="none"
        aria-hidden="true"
        className={
          compact ? "h-auto w-44" : "h-auto w-[232px] tv:w-[300px]"
        }
      >
        <g ref={groupRef} dangerouslySetInnerHTML={initialMarkup} />
      </svg>
      <p className="mt-1.5 text-xs tracking-[0.04em] text-dim tv:text-sm">
        {label}
      </p>
    </div>
  );
}
