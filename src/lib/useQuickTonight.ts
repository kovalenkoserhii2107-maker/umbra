import { useEffect, useMemo, useState } from "react";
import { useAppState, type LibraryItem } from "../state";
import { runEngine, type TasteSummary } from "./engine";
import { useLibraryMeta } from "./meta";
import { PLATFORMS } from "./providers";
import { readStorage, writeStorage } from "./storage";
import { tmdb } from "./tmdb";
import {
  continueShows,
  keyOf,
  watchlistEntry,
  withServices,
  type Answers,
  type Pick,
} from "./tonight";

/*
 * Umbra's own evening picker without its look: the taste engine
 * (lib/engine) behind optional answers. On the web it starts at once with
 * "trust my taste"; on TV after four questions or at once. Drawn by
 * pages/Tonight.tsx and tv/TvTonight.tsx.
 */

const PAGE = 6;
const LAST = "umbra.tonight";

export type Step = 0 | 1 | 2 | 3;

export const INSTANT: Omit<Answers, "mine"> = {
  mood: "any",
  format: "any",
  company: "solo",
  era: "any",
};

const daySeed = () => Math.floor(Date.now() / 86400_000);

export function useQuickTonight(
  rewatch: boolean,
  { instant = false }: { instant?: boolean } = {},
) {
  const { items, settings, get, upsert, libraryReady } = useAppState();
  const { meta } = useLibraryMeta(items);
  const services = PLATFORMS.filter((p) => settings.subscribed.includes(p.id));
  const [step, setStep] = useState<Step | "done">(instant ? "done" : 0);
  const [answers, setAnswers] = useState<Partial<Answers>>(() => {
    let mine = services.length > 0;
    try {
      const last = JSON.parse(readStorage(LAST) || "{}") as Partial<Answers>;
      mine = last.mine ?? mine;
    } catch {
      /* first time */
    }
    return instant ? { ...INSTANT, mine } : { mine };
  });
  // Another seed: other titles near the top. The day's seed by default.
  const [seed, setSeed] = useState(daySeed);
  const [ranked, setRanked] = useState<Pick[] | null>(null);
  const [shown, setShown] = useState<Pick[]>([]);
  const [page, setPage] = useState(0);
  const [cont, setCont] = useState<LibraryItem[]>([]);
  const [taste, setTaste] = useState<TasteSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // With watched titles allowed, only dropped ones stay out.
  const seen = useMemo(
    () =>
      new Set(
        items
          .filter((x) =>
            rewatch ? x.status === "dropped" : x.status !== "watchlist",
          )
          .map((x) => keyOf(x.type, x.id)),
      ),
    [items, rewatch],
  );

  function answer<K extends keyof Answers>(
    key: K,
    value: Answers[K],
    next: Step | "done",
  ) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setStep(next);
  }

  // Waits for the library: the picks are built from it.
  const complete =
    libraryReady &&
    step === "done" &&
    answers.mood &&
    answers.format &&
    answers.company &&
    answers.era;
  const key = complete ? JSON.stringify({ ...answers, rewatch, seed }) : "";

  useEffect(() => {
    if (!complete) return;
    const a = answers as Answers;
    writeStorage(LAST, JSON.stringify(a));
    let alive = true;
    setBusy(true);
    setError("");
    setRanked(null);
    setShown([]);
    setPage(0);
    (async () => {
      const result = await runEngine({
        answers: a,
        items,
        meta,
        region: settings.region,
        services: settings.subscribed,
        seen,
        seed,
      });
      if (!alive) return;
      setTaste(result.summary);
      const names = new Map<number, string>();
      if (a.mood !== "any") {
        const tv = await tmdb.genres("tv").catch(() => null);
        for (const g of tv?.genres ?? []) names.set(g.id, g.name);
      }
      setCont(continueShows(items, meta, a, names));
      const strict = a.mine && services.length > 0;
      const first = await withServices(
        result.picks,
        settings.region,
        services,
        strict,
        strict ? 30 : PAGE,
      );
      if (!alive) return;
      setRanked(strict ? first : result.picks);
      setShown(first.slice(0, PAGE));
    })()
      .catch(
        () =>
          alive &&
          setError("Не вдалося підібрати. Перевір інтернет і спробуй ще раз."),
      )
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [key]);

  async function more() {
    if (!ranked) return;
    const next = page + 1;
    const slice = ranked.slice(next * PAGE, next * PAGE + PAGE);
    if (!slice.length) return;
    setBusy(true);
    const annotated = await withServices(
      slice,
      settings.region,
      services,
      false,
      PAGE,
    );
    setShown((s) => [...s, ...annotated]);
    setPage(next);
    setBusy(false);
  }

  const save = (p: Pick) => upsert(watchlistEntry(p));

  const restart = () => {
    setStep(0);
    setRanked(null);
    setShown([]);
  };

  /** Straight to picks by taste alone, no questions. */
  const startInstant = () => {
    setAnswers((a) => ({ ...INSTANT, mine: a.mine }));
    setStep("done");
  };

  /** The same answers, another evening: other titles near the top. */
  const shuffle = () => setSeed((s) => s + 1);

  return {
    step,
    setStep,
    answers,
    setAnswers,
    answer,
    ranked,
    shown,
    more,
    cont,
    taste,
    busy,
    error,
    save,
    restart,
    startInstant,
    shuffle,
    services,
    get,
  };
}
