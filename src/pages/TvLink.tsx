import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, tvAnswer, tvCodeInfo, type TvCodeInfo } from "../lib/api";
import { idToken, useAuth } from "../lib/auth";
import { prettyCode } from "../components/TvLogin";

const clean = (value: string | null) =>
  (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

type State =
  | { stage: "loading" }
  | { stage: "ask"; info: TvCodeInfo }
  | { stage: "sending"; info: TvCodeInfo; approve: boolean }
  | { stage: "done"; approved: boolean }
  | { stage: "error"; message: string };

function problem(e: unknown) {
  const code = e instanceof ApiError ? e.code : "";
  if (code === "tv_code_expired" || code === "bad_code")
    return "Код застарів або введений з помилкою. На телевізорі вже новий — відскануй його ще раз.";
  if (code === "tv_answered") return "На цей код уже відповіли.";
  if (code === "network")
    return "Немає зв’язку. Перевір інтернет і спробуй ще раз.";
  return "Не вдалося. Спробуй ще раз.";
}

/** Typing the code by hand, when the QR cannot be scanned. */
function CodeForm({ onSubmitCode }: { onSubmitCode: (code: string) => void }) {
  const [text, setText] = useState("");
  const code = clean(text);
  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 8) onSubmitCode(code);
      }}
    >
      <label className="block text-sm text-mute" htmlFor="tv-code">
        Код з екрана телевізора
      </label>
      <input
        id="tv-code"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={9}
        placeholder="ABCD-EFGH"
        className="w-full rounded-2xl border border-hairline bg-card px-4 py-3 text-center font-mono text-xl tracking-[0.2em] uppercase"
      />
      <button
        type="submit"
        disabled={code.length !== 8}
        className="w-full rounded-full bg-accent py-3 text-black disabled:opacity-50"
      >
        Далі
      </button>
    </form>
  );
}

/**
 * The phone side of signing in on a TV: the QR on the TV opens this page;
 * the person signed in here lets the TV into the same account, or refuses.
 */
export function TvLinkPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const code = clean(params.get("code"));
  const { account } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ stage: "loading" });

  function openCode(next: string) {
    if (next === code) setAttempt((n) => n + 1);
    else navigate(`/tv-link?code=${next}`);
  }

  useEffect(() => {
    if (!code) return;
    let alive = true;
    setState({ stage: "loading" });
    idToken()
      .then((token) => tvCodeInfo(code, token))
      .then((info) => {
        if (!alive) return;
        if (info.status === "pending") setState({ stage: "ask", info });
        else
          setState({
            stage: "error",
            message: "На цей код уже відповіли.",
          });
      })
      .catch((e) => alive && setState({ stage: "error", message: problem(e) }));
    return () => {
      alive = false;
    };
  }, [code, attempt]);

  async function answer(info: TvCodeInfo, approve: boolean) {
    setState({ stage: "sending", info, approve });
    try {
      await tvAnswer(code, approve, await idToken());
      setState({ stage: "done", approved: approve });
    } catch (e) {
      setState({ stage: "error", message: problem(e) });
    }
  }

  return (
    <div className="rise mx-auto max-w-md py-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        Телевізор
      </p>
      <h1 className="mt-2 text-3xl tracking-tight">Вхід на телевізорі</h1>
      {!code ? (
        <>
          <p className="mt-3 text-sm text-mute">
            Відкрий Umbra на телевізорі та відскануй QR-код камерою телефона —
            або введи код з екрана.
          </p>
          <CodeForm onSubmitCode={openCode} />
        </>
      ) : state.stage === "loading" ? (
        <p role="status" className="mt-8 text-sm text-mute">
          Перевіряю код…
        </p>
      ) : state.stage === "ask" || state.stage === "sending" ? (
        <div className="mt-6 rounded-3xl border border-hairline bg-card p-6">
          <p className="text-lg">Увійти в Umbra на телевізорі?</p>
          <p className="mt-4 text-2xl">{state.info.device}</p>
          <p className="mt-1 font-mono text-lg tracking-[0.2em] text-mute">
            {prettyCode(code)}
          </p>
          <p className="mt-4 text-sm text-mute">
            Телевізор увійде в акаунт{" "}
            <span className="text-ink">{account?.email || account?.name}</span>:
            побачить полицю, оцінки та нотатки.
          </p>
          <p className="mt-3 rounded-2xl bg-accent/10 px-4 py-3 text-sm text-accent">
            Підтверджуй, тільки якщо цей код зараз на екрані твого
            телевізора.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={state.stage === "sending"}
              onClick={() => answer(state.info, false)}
              className="rounded-full border border-hairline py-3 disabled:opacity-50"
            >
              {state.stage === "sending" && !state.approve
                ? "Відхиляю…"
                : "Відхилити"}
            </button>
            <button
              type="button"
              disabled={state.stage === "sending"}
              onClick={() => answer(state.info, true)}
              className="rounded-full bg-accent py-3 text-black disabled:opacity-50"
            >
              {state.stage === "sending" && state.approve
                ? "Підтверджую…"
                : "Підтвердити"}
            </button>
          </div>
        </div>
      ) : state.stage === "done" ? (
        <div className="mt-8">
          <p role="status" className="text-lg">
            {state.approved
              ? "Готово — телевізор входить у твій акаунт."
              : "Вхід відхилено. Телевізор не отримав доступ."}
          </p>
          <Link to="/" className="mt-6 inline-block text-accent">
            На головну
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <p role="alert" className="text-accent">
            {state.message}
          </p>
          <CodeForm onSubmitCode={openCode} />
        </div>
      )}
    </div>
  );
}
