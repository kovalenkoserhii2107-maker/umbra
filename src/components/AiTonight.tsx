import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, aiTonight, type AiQuestion, type AiStep } from "../lib/api";
import {
  QUESTIONS_PER_ROUND,
  buildProfile,
  resolvePicks,
  roundAnswers,
  roundOf,
} from "../lib/ai";
import { idToken } from "../lib/auth";
import type { LibraryItem } from "../lib/library";
import type { MetaMap } from "../lib/meta";
import type { Platform } from "../lib/providers";
import { keyOf, watchlistEntry, withServices, type Pick } from "../lib/tonight";
import { titleOf } from "../lib/tmdb";
import { yearOf } from "../lib/format";
import { Option, PickCard, Question } from "./TonightCards";

type Verdict = "seen" | "liked" | "disliked";

/** The session survives a look at a title page and coming back. */
type Session = {
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

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    return { taste: "", reserve: [], before: {}, ...s } as Session;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the session just won't survive navigation */
  }
}

function errorText(error: unknown) {
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

type Library = {
  get: (type: Pick["type"], id: number) => LibraryItem | undefined;
  upsert: (item: Omit<LibraryItem, "updatedAt">) => void;
  update: (
    type: Pick["type"],
    id: number,
    patch: { rating?: number | null },
  ) => void;
  remove: (type: Pick["type"], id: number) => void;
};

/** A card that can be swiped: right means "seen it", left "not that". */
function Swipe({
  onRight,
  onLeft,
  children,
}: {
  onRight: () => void;
  onLeft: () => void;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const from = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const moved = useRef(false);
  const LIMIT = 90;
  const end = () => {
    if (dragging.current && dx > LIMIT) onRight();
    else if (dragging.current && dx < -LIMIT) onLeft();
    from.current = null;
    dragging.current = false;
    setDx(0);
  };
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        aria-hidden="true"
        className={`absolute inset-0 flex items-center rounded-2xl px-5 text-sm ${dx > 0 ? "justify-start bg-ok/20 text-ok" : "justify-end bg-accent/20 text-accent"}`}
        style={{ opacity: Math.min(1, Math.abs(dx) / LIMIT) }}
      >
        {dx > 0 ? "✓ Смотрел" : "Не то ✕"}
      </div>
      <div
        className="relative"
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: dx ? "none" : "transform .2s",
          touchAction: "pan-y",
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          from.current = { x: e.clientX, y: e.clientY };
          dragging.current = false;
          moved.current = false;
        }}
        onPointerMove={(e) => {
          if (!from.current) return;
          const mx = e.clientX - from.current.x;
          const my = e.clientY - from.current.y;
          if (!dragging.current) {
            if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) {
              dragging.current = true;
              moved.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            } else if (Math.abs(my) > 12) {
              from.current = null;
              return;
            }
          }
          if (dragging.current) setDx(mx);
        }}
        onPointerUp={end}
        onPointerCancel={() => {
          from.current = null;
          dragging.current = false;
          setDx(0);
        }}
        // A swipe must not also open the title under the finger.
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** A card already dealt with: seen (with a quick rating) or rejected. */
function DoneRow({
  pick,
  verdict,
  rating,
  onRate,
  onUndo,
}: {
  pick: Pick;
  verdict: Verdict;
  rating: number | null;
  onRate: (r: number) => void;
  onUndo: () => void;
}) {
  const title = titleOf(pick.item);
  return (
    <div
      aria-label={title}
      className="rounded-2xl border border-hairline bg-card/60 px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm">
          <span className={verdict === "seen" ? "text-ok" : "text-dim"}>
            {verdict === "seen" ? "✓ Смотрел" : "✕ Не то"}
          </span>{" "}
          · {title}
        </p>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 text-xs text-mute underline"
        >
          {verdict === "seen" ? "Отменить" : "Вернуть"}
        </button>
      </div>
      {verdict === "seen" ? (
        <div className="mt-2">
          <p className="text-xs text-mute">
            {rating
              ? `В коллекции с оценкой ${rating}/10`
              : "Добавлено в коллекцию. Как тебе?"}
          </p>
          <div
            role="group"
            aria-label={`Оценка «${title}»`}
            className="mt-1.5 flex flex-wrap gap-1"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rating === r}
                onClick={() => onRate(r)}
                className={`h-7 w-7 rounded-full border text-xs ${rating === r ? "border-accent bg-accent text-black" : "border-hairline text-mute"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AiTonight({
  items,
  meta,
  region,
  services,
  library,
}: {
  items: LibraryItem[];
  meta: MetaMap;
  region: string;
  services: Platform[];
  library: Library;
}) {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [busy, setBusy] = useState<"" | "ask" | "pick">("");
  const [error, setError] = useState("");
  const [custom, setCustom] = useState("");
  const retry = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => saveSession(session), [session]);

  const seen = useMemo(
    () =>
      new Set(
        items
          .filter((x) => x.status !== "watchlist")
          .map((x) => keyOf(x.type, x.id)),
      ),
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
        });
        if (!alive.current) return;
        setSession({ ...next, asked: [...next.asked, q] });
      } else {
        const data = await aiTonight(token, {
          stage,
          profile: next.profile,
          steps: next.steps,
        });
        const found = await resolvePicks(
          data.picks,
          new Set([...seen, ...next.shown]),
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
    saveSession(null);
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

  const isSaved = (p: Pick) => Boolean(library.get(p.type, p.item.id));

  /** Marks a card; a new pick from the reserve takes its place. */
  function judge(p: Pick, verdict: Verdict) {
    if (!session || session.verdicts[p.key]) return;
    const before = { ...session.before };
    if (verdict === "seen") {
      before[p.key] = library.get(p.type, p.item.id) ?? null;
      library.upsert(watchlistEntry(p, "watched"));
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

  const failure = error ? (
    <div role="alert" className="mt-5 text-sm text-accent">
      {error}{" "}
      {retry.current ? (
        <button
          type="button"
          onClick={() => retry.current?.()}
          className="underline"
        >
          Повторить
        </button>
      ) : null}
    </div>
  ) : null;

  if (busy)
    return (
      <p role="status" className="mt-6 text-sm text-mute">
        {busy === "ask"
          ? "Claude думает, что спросить…"
          : "Claude подбирает фильмы и сериалы под тебя — это до минуты…"}
      </p>
    );

  if (!session)
    return (
      <section className="rise mt-6 rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/10 to-transparent p-5">
        <h2 className="text-xl tracking-tight">Подбор с Claude</h2>
        <p className="mt-2 text-sm text-mute">
          Claude изучит твою библиотеку — оценки, «Хочу посмотреть», брошенное —
          и задаст четыре вопроса, каждый раз выбирая самый полезный. Потом
          предложит фильмы и сериалы, а если не попадёт — можно уточнить ещё.
        </p>
        <button
          type="button"
          onClick={start}
          className="mt-4 rounded-full bg-accent px-5 py-2 text-sm text-black"
        >
          Начать
        </button>
        {failure}
      </section>
    );

  return (
    <div>
      {failure}
      {current ? (
        <Question
          step={answered}
          round={roundOf(session.steps)}
          title={current.question}
          onBack={session.asked.length > 1 ? back : undefined}
        >
          {current.options.map((o) => (
            <Option
              key={o.label}
              label={o.label}
              hint={o.hint}
              onClick={() => answer(o.label)}
            />
          ))}
          {current.allow_custom ? (
            <form
              className="flex gap-2 sm:col-span-2"
              onSubmit={(e) => {
                e.preventDefault();
                answer(custom);
              }}
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                maxLength={300}
                placeholder="Или ответь своими словами"
                aria-label="Свой ответ"
                className="min-w-0 flex-1 rounded-2xl border border-hairline bg-card px-4 py-3 text-sm"
              />
              <button
                type="submit"
                disabled={!custom.trim()}
                className="rounded-2xl border border-hairline px-4 text-sm disabled:opacity-50"
              >
                Ответить
              </button>
            </form>
          ) : null}
        </Question>
      ) : null}

      {!current && session.picks.length ? (
        <section className="mt-6">
          {session.taste ? (
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                что я понял о твоём вкусе
              </p>
              <p className="mt-1.5 text-sm leading-6">{session.taste}</p>
            </div>
          ) : null}
          {session.intro ? (
            <p className="mt-4 text-sm text-mute">{session.intro}</p>
          ) : null}
          <p className="mt-2 text-xs text-dim">
            Уже видел — жми «✓ Смотрел» или смахни вправо: фильм попадёт в
            коллекцию, а на его место придёт новый. Не то — влево.
          </p>
          <div className="mt-4 space-y-3">
            {session.picks.map((p) => {
              const verdict = session.verdicts[p.key];
              if (verdict)
                return (
                  <DoneRow
                    key={p.key}
                    pick={p}
                    verdict={verdict}
                    rating={library.get(p.type, p.item.id)?.rating ?? null}
                    onRate={(r) =>
                      library.update(p.type, p.item.id, { rating: r })
                    }
                    onUndo={() => undo(p)}
                  />
                );
              return (
                <Swipe
                  key={p.key}
                  onRight={() => judge(p, "seen")}
                  onLeft={() => judge(p, "disliked")}
                >
                  <PickCard
                    pick={p}
                    saved={isSaved(p)}
                    onSave={() => library.upsert(watchlistEntry(p))}
                  >
                    <button
                      type="button"
                      onClick={() => judge(p, "seen")}
                      className="rounded-full border border-ok/50 px-3 py-1 text-xs text-ok"
                    >
                      ✓ Смотрел
                    </button>
                    <button
                      type="button"
                      onClick={() => judge(p, "disliked")}
                      className="rounded-full border border-hairline px-3 py-1 text-xs text-mute"
                    >
                      Не то
                    </button>
                  </PickCard>
                </Swipe>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => proceed("ask")}
              className="rounded-full bg-accent px-4 py-2 text-sm text-black"
            >
              Уточнить ещё (4 вопроса)
            </button>
            <button
              type="button"
              onClick={() => proceed("pick")}
              className="rounded-full border border-hairline px-4 py-2 text-sm"
            >
              Ещё варианты
            </button>
            <button
              type="button"
              onClick={start}
              className="rounded-full px-4 py-2 text-sm text-mute"
            >
              Начать заново
            </button>
          </div>
        </section>
      ) : null}

      {!current && !session.picks.length && !error ? (
        <div className="mt-6 text-sm text-mute">
          Claude не нашёл ничего нового.{" "}
          <button
            type="button"
            onClick={() => proceed("ask")}
            className="text-accent"
          >
            Уточнить ещё
          </button>
        </div>
      ) : null}
    </div>
  );
}
