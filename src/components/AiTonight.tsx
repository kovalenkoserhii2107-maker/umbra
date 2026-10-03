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
import { keyOf, withServices, type Pick } from "../lib/tonight";
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
  picks: Pick[];
  /** Every title shown in this session, never offered twice. */
  shown: string[];
  verdicts: Record<string, Verdict>;
};

const KEY = "umbra.aiTonight";

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
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

const VERDICTS: Array<{ id: Verdict; label: string }> = [
  { id: "seen", label: "Уже смотрел" },
  { id: "disliked", label: "Не то" },
];

export function AiTonight({
  items,
  meta,
  region,
  services,
  isSaved,
  onSave,
}: {
  items: LibraryItem[];
  meta: MetaMap;
  region: string;
  services: Platform[];
  isSaved: (p: Pick) => boolean;
  onSave: (p: Pick) => void;
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
        );
        const annotated = await withServices(
          found,
          region,
          services,
          false,
          found.length,
        );
        if (!alive.current) return;
        setSession({
          ...next,
          asked: [],
          intro: data.intro,
          picks: annotated,
          shown: [...next.shown, ...annotated.map((p) => p.key)],
          verdicts: {},
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
        intro: "",
        picks: [],
        shown: [],
        verdicts: {},
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

  /** Puts the shown picks and reactions into the session, then goes on. */
  function proceed(stage: "ask" | "pick") {
    if (!session) return;
    const shown: AiStep = {
      shown: session.picks.map((p) => ({
        title: titleOf(p.item),
        year:
          Number(yearOf(p.item.release_date || p.item.first_air_date)) || null,
        type: p.type,
        verdict: session.verdicts[p.key] ?? (isSaved(p) ? "liked" : null),
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
          {session.intro ? (
            <p className="text-sm text-mute">{session.intro}</p>
          ) : null}
          <div className="mt-4 space-y-3">
            {session.picks.map((p) => (
              <PickCard
                key={p.key}
                pick={p}
                saved={isSaved(p)}
                onSave={() => onSave(p)}
              >
                {VERDICTS.map((v) => {
                  const on = session.verdicts[p.key] === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const verdicts = { ...session.verdicts };
                        if (on) delete verdicts[p.key];
                        else verdicts[p.key] = v.id;
                        setSession({ ...session, verdicts });
                      }}
                      className={`rounded-full border px-3 py-1 text-xs ${on ? "border-accent text-accent" : "border-hairline text-mute"}`}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </PickCard>
            ))}
          </div>
          <p className="mt-4 text-xs text-dim">
            Отметь, что уже видел или что не то, — Claude учтёт это в следующем
            раунде.
          </p>
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
