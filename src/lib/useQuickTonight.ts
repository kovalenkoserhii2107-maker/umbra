import { useEffect, useMemo, useState } from "react";
import { useAppState, type LibraryItem } from "../state";
import { useLibraryMeta } from "./meta";
import { PLATFORMS } from "./providers";
import { readStorage, writeStorage } from "./storage";
import {
  continueShows,
  genreTaste,
  keyOf,
  loadCandidates,
  rankTonight,
  watchlistEntry,
  withServices,
  type Answers,
  type Pick,
} from "./tonight";

/*
 * The rule-based evening picker without its look: four fixed questions,
 * then titles ranked by the library. Drawn by pages/Tonight.tsx and by the
 * TV screen (tv/TvTonight.tsx).
 */

const PAGE = 6;
const LAST = "umbra.tonight";

export type Step = 0 | 1 | 2 | 3;

export function useQuickTonight(rewatch: boolean) {
  const { items, settings, get, upsert } = useAppState();
  const { meta } = useLibraryMeta(items);
  const services = PLATFORMS.filter((p) => settings.subscribed.includes(p.id));
  const [step, setStep] = useState<Step | "done">(0);
  const [answers, setAnswers] = useState<Partial<Answers>>(() => {
    try {
      const last = JSON.parse(readStorage(LAST) || "{}") as Partial<Answers>;
      return { mine: last.mine ?? services.length > 0 };
    } catch {
      return { mine: services.length > 0 };
    }
  });
  const [ranked, setRanked] = useState<Pick[] | null>(null);
  const [shown, setShown] = useState<Pick[]>([]);
  const [page, setPage] = useState(0);
  const [cont, setCont] = useState<LibraryItem[]>([]);
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

  const complete =
    step === "done" &&
    answers.mood &&
    answers.format &&
    answers.company &&
    answers.era;
  const key = complete ? JSON.stringify({ ...answers, rewatch }) : "";

  // Collect and rank once the four answers are in.
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
      const { candidates, names } = await loadCandidates(
        a,
        items,
        meta,
        settings.region,
        settings.subscribed,
      );
      const list = rankTonight(candidates, a, {
        seen,
        taste: genreTaste(items, meta),
        names,
      });
      if (!alive) return;
      setCont(continueShows(items, meta, a, names));
      const strict = a.mine && services.length > 0;
      const first = await withServices(
        list,
        settings.region,
        services,
        strict,
        strict ? 30 : PAGE,
      );
      if (!alive) return;
      setRanked(strict ? first : list);
      setShown(first.slice(0, PAGE));
    })()
      .catch(
        () =>
          alive &&
          setError(
            "Не удалось подобрать. Проверь интернет и попробуй ещё раз.",
          ),
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
    busy,
    error,
    save,
    restart,
    services,
    get,
  };
}
