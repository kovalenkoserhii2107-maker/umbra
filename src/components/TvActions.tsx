import type { Video, WatchGroup } from "../lib/tmdb";
import {
  installedApps,
  launchTvApp,
  playTrailer,
  watchApps,
} from "../lib/tvMode";

/**
 * The title's first row on TV: watch it in a streaming app installed on the
 * TV, or play the trailer in YouTube.
 */
export function TvTitleActions({
  title,
  offers,
  videos,
}: {
  /** What to search for in the streaming app. */
  title: string;
  offers?: WatchGroup;
  videos: Video[];
}) {
  const apps = watchApps(offers, installedApps());
  const trailer = videos[0];
  if (!apps.length && !trailer) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {apps.map((a, i) => (
        <button
          key={a.app}
          type="button"
          data-tv-autofocus={i === 0 ? "" : undefined}
          onClick={() => launchTvApp(a.app, title)}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-base font-medium text-black"
        >
          <span aria-hidden="true">▶</span> Смотреть в {a.name}
          <span className="text-sm font-normal text-black/60">· {a.offer}</span>
        </button>
      ))}
      {trailer ? (
        <button
          type="button"
          data-tv-autofocus={apps.length ? undefined : ""}
          onClick={() => playTrailer(trailer.key)}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-white/25 bg-white/5 px-5 text-base"
        >
          <span aria-hidden="true" className="text-accent">
            ▶
          </span>{" "}
          Трейлер
        </button>
      ) : null}
    </div>
  );
}
