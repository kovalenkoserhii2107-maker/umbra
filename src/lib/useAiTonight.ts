import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, aiTonight, type AiQuestion, type AiStep } from "./api";
import {
  QUESTIONS_PER_ROUND,
  buildProfile,
  resolvePicks,
  roundAnswers,
  roundOf,
} from "./ai";
import { idToken, useAuth } from "./auth";
import type { LibraryItem } from "./library";
import type { MetaMap } from "./meta";
import type { Platform } from "./providers";
import { keyOf, watchlistEntry, withServices, type Pick } from "./tonight";
import { titleOf } from "./tmdb";
import { yearOf } from "./format";

/*
 * The evening picker with Claude, without its look: the phone page
 * (components/AiTonight.tsx) and the TV screen (tv/TvTonight.tsx) draw it.
 */

export type Verdict = "seen" | "liked" | "disliked";

/** The session survives a look at a title page and coming back. */
export type Session = {
  profile: string;
  steps: AiStep[];
  /** Questions of the current round, the last one being asked now. */
  asked: AiQuestion[];
  intro: string;
  /** What Claude understood about the user's taste. */
  taste: string;
  picks: Pick[];
  /** Found but not shown yet: they take the place of seen or rejected cards. */
  reserve: Pick[];
  /** Every title shown in this session, never offered twice. */
  shown: string[];
  verdicts: Record<string, Verdict>;
  /** Library entries as they were before "seen", to undo it. */
  before: Record<string, LibraryItem | null>;
};

const KEY = "umbra.aiTonight";
const SHOW = 6;
const RESERVE = 6;

function loadSession(uid: string | undefined): Session | null {
  if (!uid) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session> & { uid?: string };
    if (s.uid !== uid) return null;
    delete s.uid;
    return { taste: "", reserve: [], before: {}, ...s } as Session;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null, uid: string | undefined) {
  try {
    if (s && uid) sessionStorage.setItem(KEY, JSON.stringify({ ...s, uid }));
    else if (!s) sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the session just won't survive navigation */
  }
}

export function errorText(error: unknown) {
  const code = error instanceof ApiError ? error.code : "";
  switch (code) {
    case "ai_limit":
      return "Дневной лимит запросов к Claude исчерпан. Попробуй завтра или быстрый подбор.";
    case "ai_no_credit":
      return "На счёте Anthropic закончились средства — пополни баланс в console.anthropic.com.";
    case "ai_key_rejected":
      return "Anthropic не принял ключ. Проверь секрет ANTHROPIC_API_KEY.";
    case "ai_not_configured":
      return "Claude ещё не подключён: нужен секрет ANTHROPIC_API_KEY.";
    case "ai_not_allowed":
      return "Подбор с Claude не включён для этого аккаунта.";
    case "ai_busy":
      return "Claude сейчас перегружен. Попробуй ещё раз через минуту.";
    case "ai_refused":
      return "Claude не стал отвечать на этот запрос. Попробуй ответить иначе.";
    case "sign_in_required":
    case "bad_token":
      return "Войди в аккаунт, чтобы подбирал Claude.";
    case "network":
      return "Нет связи с сервером. Проверь интернет.";
    default:
      return "Не получилось. Попробуй ещё раз.";
  }
}

export type Library = {
  get: (type: Pick["type"], id: number) => LibraryItem | undefined;
  upsert: (item: Omit<LibraryItem, "updatedAt">) => void;
  update: (
    type: Pick["type"],
    id: number,
    patch: { rating?: number | null },
  ) => void;
  remove: (type: Pick["type"], id: number) => void;
};

export function useAiTonight({
  items,
  meta,
  region,
  services,
  library,
  rewatch,
}: {
  items: LibraryItem[];
  meta: MetaMap;
  region: string;
  services: Platform[];
  library: Library;
  /** Titles I have already watched may be offered too. */
  rewatch: boolean;
}) {
  const { account } = useAuth();
  const uid = account?.sub;
  const [session, setSession] = useState<Session | null>(() =>
    loadSession(uid),
  );
  const [busy, setBusy] = useState<"" | "ask" | "pick">("");
  const [error, setError] = useState("");
  const [custom, setCustom] = useState("");
  const retry = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const lastUid = useRef(uid);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (lastUid.current !== uid) {
      lastUid.current = uid;
      setSession(loadSession(uid));
      setError("");
      setCustom("");
      retry.current = null;
      return;
    }
    saveSession(session, uid);
  }, [session, uid]);

  const seen = useMemo(
    () =>
      new Set(
        items
          .filter((x) => x.status !== "watchlist")
          .map((x) => keyOf(x.type, x.id)),
      ),
    [items],
  );
  /** Never offered, even with watched titles allowed: dropped ones. */
  const disliked = useMemo(
    () =>
      items
        .filter((x) => x.status === "dropped")
        .map((x) => keyOf(x.type, x.id)),
    [items],
  );

  /** Sends `next` and shows the result; on failure nothing changes. */
  async function run(next: Session, stage: "ask" | "pick") {
    setBusy(stage);
    setError("");
    retry.current = () => void run(next, stage);
    try {
      const token = await idToken();
      if (!token) throw new ApiError(401, "sign_in_required");
      if (stage === "ask") {
        const q = await aiTonight(token, {
          stage,
          profile: next.profile,
          steps: next.steps,
          rewatch,
        });
        if (!alive.current) return;
        setSession({ ...next, asked: [...next.asked, q] });
      } else {
        const data = await aiTonight(token, {
          stage,
          profile: next.profile,
          steps: next.steps,
          rewatch,
        });
        const found = await resolvePicks(
          data.picks,
          new Set(
            rewatch ? [...disliked, ...next.shown] : [...seen, ...next.shown],
          ),
          SHOW + RESERVE,
        );
        const annotated = await withServices(
          found,
          region,
          services,
          false,
          found.length,
        );
        if (!alive.current) return;
        const picks = annotated.slice(0, SHOW);
        setSession({
          ...next,
          asked: [],
          taste: data.taste,
          intro: data.intro,
          picks,
          reserve: annotated.slice(SHOW),
          shown: [...next.shown, ...picks.map((p) => p.key)],
          verdicts: {},
          before: {},
        });
      }
      setCustom("");
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      if (alive.current) setBusy("");
    }
  }

  function start() {
    saveSession(null, uid);
    void run(
      {
        profile: buildProfile(items, meta, region, services),
        steps: [],
        asked: [],
        taste: "",
        intro: "",
        picks: [],
        reserve: [],
        shown: [],
        verdicts: {},
        before: {},
      },
      "ask",
    );
  }

  function answer(text: string) {
    if (!session || busy) return;
    const q = session.asked.at(-1);
    if (!q || !text.trim()) return;
    const steps = [...session.steps, { question: q.question, answer: text }];
    void run(
      { ...session, steps },
      roundAnswers(steps) >= QUESTIONS_PER_ROUND ? "pick" : "ask",
    );
  }

  function back() {
    if (!session || busy || session.asked.length < 2) return;
    setError("");
    setSession({
      ...session,
      steps: session.steps.slice(0, -1),
      asked: session.asked.slice(0, -1),
    });
  }

  const isSaved = (p: Pick) =>
    library.get(p.type, p.item.id)?.status === "watchlist";

  /** Marks a card; a new pick from the reserve takes its place. */
  /** `rating` — the score given right away when marking a pick as seen. */
  function judge(p: Pick, verdict: Verdict, rating?: number | null) {
    if (!session || session.verdicts[p.key]) return;
    const before = { ...session.before };
    if (verdict === "seen") {
      const was = library.get(p.type, p.item.id);
      before[p.key] = was ?? null;
      // Already watched: keep the entry and its rating as they are.
      if (was?.status !== "watched")
        library.upsert({
          ...watchlistEntry(p, "watched"),
          rating: rating ?? was?.rating ?? null,
          note: was?.note ?? "",
        });
    }
    const [next, ...reserve] = session.reserve;
    setSession({
      ...session,
      verdicts: { ...session.verdicts, [p.key]: verdict },
      before,
      picks: next ? [...session.picks, next] : session.picks,
      reserve,
      shown: next ? [...session.shown, next.key] : session.shown,
    });
  }

  function undo(p: Pick) {
    if (!session) return;
    const verdicts = { ...session.verdicts };
    const before = { ...session.before };
    if (verdicts[p.key] === "seen" && p.key in before) {
      const was = before[p.key];
      if (was) library.upsert(was);
      else library.remove(p.type, p.item.id);
      delete before[p.key];
    }
    delete verdicts[p.key];
    setSession({ ...session, verdicts, before });
  }

  /** Puts the shown picks and reactions into the session, then goes on. */
  function proceed(stage: "ask" | "pick") {
    if (!session) return;
    const shown: AiStep = {
      shown: session.picks.map((p) => ({
        title: titleOf(p.item),
        year:
          Number(yearOf(p.item.release_date || p.item.first_air_date)) || null,
        type: p.type,
        verdict:
          session.verdicts[p.key] ??
          (library.get(p.type, p.item.id)?.status === "watchlist"
            ? "liked"
            : null),
        rating:
          session.verdicts[p.key] === "seen"
            ? (library.get(p.type, p.item.id)?.rating ?? null)
            : null,
      })),
    };
    void run(
      { ...session, steps: [...session.steps, shown], asked: [] },
      stage,
    );
  }

  const current = session?.asked.at(-1);
  const answered = session ? roundAnswers(session.steps) : 0;

  return {
    session,
    busy,
    error,
    retry: () => retry.current?.(),
    canRetry: Boolean(retry.current),
    custom,
    setCustom,
    start,
    answer,
    back,
    judge,
    undo,
    proceed,
    isSaved,
    current,
    answered,
    round: session ? roundOf(session.steps) : 1,
  };
}
