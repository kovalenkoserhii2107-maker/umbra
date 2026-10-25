import { useEffect, useState } from "react";
import { ApiError, tvDevices, tvOpen, type TvDevice } from "../lib/api";
import { idToken, useAuth } from "../lib/auth";
import { isTv } from "../lib/tvMode";

/** The account's TVs, asked once per visit (worker/src/tvRemote.ts). */
let known: Promise<TvDevice[]> | null = null;

function devices() {
  known ??= idToken()
    .then((token) => tvDevices(token))
    .then((r) => r.devices)
    .catch(() => {
      known = null;
      return [];
    });
  return known;
}

type State =
  | { step: "idle" }
  | { step: "sending" }
  | { step: "sent"; device: string }
  | { step: "error"; text: string };

/**
 * «На телевизоре в Lampa»: on the phone, opens this title in Lampa on the
 * TV of the same account — the TV wakes up if it sleeps. Shown when a TV
 * with Lampa has signed in to Umbra.
 */
export function SendToTv({ type, id }: { type: "movie" | "tv"; id: number }) {
  const { account } = useAuth();
  const [tvs, setTvs] = useState<TvDevice[]>([]);
  const [state, setState] = useState<State>({ step: "idle" });

  useEffect(() => {
    if (isTv || !account) return;
    let alive = true;
    void devices().then((list) => alive && setTvs(list.filter((d) => d.lampa)));
    return () => {
      alive = false;
    };
  }, [account?.sub]);

  useEffect(() => setState({ step: "idle" }), [type, id]);

  if (!tvs.length) return null;
  const name = tvs.length === 1 ? tvs[0].device : "телевизоре";

  async function send() {
    setState({ step: "sending" });
    try {
      await tvOpen(type, id, await idToken());
      setState({ step: "sent", device: name });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setState({
        step: "error",
        text:
          code === "no_tv"
            ? "Телевизор не отвечает. Открой на нём Umbra один раз — и попробуй снова."
            : code === "network"
              ? "Нет связи. Проверь интернет на телефоне."
              : "Не получилось отправить. Попробуй ещё раз.",
      });
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={send}
        disabled={state.step === "sending"}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-black transition-opacity disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 21h8M12 17v4M10 8.5l4 2-4 2z" />
        </svg>
        {state.step === "sending" ? "Отправляю…" : "На телевизоре в Lampa"}
      </button>
      {state.step === "sent" ? (
        <p role="status" className="mt-2 text-center text-xs text-mute">
          Открываю на{" "}
          {state.device === "телевизоре" ? "телевизоре" : `«${state.device}»`}.
        </p>
      ) : state.step === "error" ? (
        <p role="alert" className="mt-2 text-center text-xs text-mute">
          {state.text}
        </p>
      ) : tvs.every((d) => !d.background) ? (
        <p className="mt-2 text-center text-xs text-dim">
          Если Umbra на телевизоре закрыта, Lampa откроется после разрешения
          «Поверх других приложений» для Umbra.
        </p>
      ) : null}
    </div>
  );
}
