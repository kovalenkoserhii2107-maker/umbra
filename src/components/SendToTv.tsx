import { useEffect, useState } from "react";
import { ApiError, tvDevices, tvOpen, type TvDevice } from "../lib/api";
import { idToken, useAuth } from "../lib/auth";
import { isTv } from "../lib/tvMode";

/** The account's TVs, cached briefly per signed-in uid (worker/src/tvRemote.ts). */
let known: {
  uid: string;
  until: number;
  promise: Promise<TvDevice[]>;
} | null = null;

function devices(uid: string) {
  if (!known || known.uid !== uid || known.until <= Date.now()) {
    const promise = idToken()
      .then((token) => tvDevices(token))
      .then((r) => r.devices)
      .catch(() => {
        if (known?.promise === promise) known = null;
        return [];
      });
    known = { uid, until: Date.now() + 30_000, promise };
  }
  return known.promise;
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
  const [target, setTarget] = useState<string>("");
  const [state, setState] = useState<State>({ step: "idle" });

  useEffect(() => {
    if (isTv || !account) {
      setTvs([]);
      return;
    }
    let alive = true;
    void devices(account.sub).then(
      (list) => alive && setTvs(list.filter((d) => d.lampa)),
    );
    return () => {
      alive = false;
    };
  }, [account?.sub]);

  useEffect(() => setState({ step: "idle" }), [type, id]);

  if (!tvs.length) return null;
  const multi = tvs.length > 1;
  const activeId = multi
    ? target === "all" || tvs.some((d) => d.id === target)
      ? target
      : tvs[0].id
    : tvs[0].id;
  const chosenTv =
    activeId === "all" ? undefined : tvs.find((d) => d.id === activeId);
  const name = chosenTv ? chosenTv.device : "телевізорі";

  async function send() {
    setState({ step: "sending" });
    try {
      await tvOpen(
        type,
        id,
        await idToken(),
        multi && chosenTv ? chosenTv.id : undefined,
      );
      setState({ step: "sent", device: name });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setState({
        step: "error",
        text:
          code === "no_tv"
            ? "Телевізор не відповідає. Відкрий на ньому Umbra один раз — і спробуй знову."
            : code === "network"
              ? "Немає зв’язку. Перевір інтернет на телефоні."
              : "Не вдалося відправити. Спробуй ще раз.",
      });
    }
  }

  const needsOverlay = chosenTv
    ? !chosenTv.background
    : tvs.every((d) => !d.background);

  return (
    <div className="mt-3">
      {multi ? (
        <div
          role="group"
          aria-label="Телевізор"
          className="mb-2 flex flex-wrap gap-1.5"
        >
          {tvs.map((d) => {
            const on = activeId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setTarget(d.id);
                  setState({ step: "idle" });
                }}
                className={`rounded-full border px-3 py-1 text-xs ${on ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`}
              >
                {d.device}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={activeId === "all"}
            onClick={() => {
              setTarget("all");
              setState({ step: "idle" });
            }}
            className={`rounded-full border px-3 py-1 text-xs ${activeId === "all" ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`}
          >
            Всі ({tvs.length})
          </button>
        </div>
      ) : null}
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
        {state.step === "sending" ? "Відправляю…" : "На телевізорі в Lampa"}
      </button>
      {state.step === "sent" ? (
        <p role="status" className="mt-2 text-center text-xs text-mute">
          Відкриваю на{" "}
          {state.device === "телевизоре" || state.device === "телевізорі" ? "телевізорі" : `«${state.device}»`}.
        </p>
      ) : state.step === "error" ? (
        <p role="alert" className="mt-2 text-center text-xs text-mute">
          {state.text}
        </p>
      ) : needsOverlay ? (
        <p className="mt-2 text-center text-xs text-dim">
          Якщо Umbra на телевізорі закрита, Lampa відкриється після надання дозволу
          «Поверх інших додатків» для Umbra.
        </p>
      ) : null}
    </div>
  );
}
