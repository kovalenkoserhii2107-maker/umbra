import { useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { BrandLockup } from "./Brand";
import { EmailAuth } from "./EmailAuth";
import { ApiError, tvCode, tvToken, type TvCode } from "../lib/api";
import {
  authError,
  signInWithGoogleToken,
  signInWithTvToken,
} from "../lib/auth";
import {
  canGoogleOnTv,
  onTvEvent,
  startGoogleOnTv,
  tvDeviceName,
} from "../lib/tvMode";

/** "ABCDEFGH" → "ABCD-EFGH", easier to read from the sofa. */
export const prettyCode = (code: string) =>
  `${code.slice(0, 4)}-${code.slice(4)}`;

/** The phone opens this page of Umbra to approve the TV (pages/TvLink.tsx). */
function linkFor(code: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/tv-link?code=${code}`;
}

function Qr({ text }: { text: string }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return (
    <div
      role="img"
      aria-label="QR-код для входа с телефона"
      className="rounded-2xl bg-white p-3 [&>svg]:block [&>svg]:h-44 [&>svg]:w-44"
      dangerouslySetInnerHTML={{
        __html: qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }),
      }}
    />
  );
}

type PhoneState =
  | { stage: "loading" }
  | { stage: "waiting"; code: TvCode; note?: string }
  | { stage: "signing" }
  | { stage: "error"; message: string };

/**
 * Sign-in with the phone: a code as a QR, approved in Umbra on the phone.
 * The TV asks the worker every few seconds; a refused or stale code is
 * replaced by a new one.
 */
function PhoneSignIn() {
  const [state, setState] = useState<PhoneState>({ stage: "loading" });
  const [round, setRound] = useState(0);
  const note = useRef<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const next = (message?: string) => {
      note.current = message;
      setRound((r) => r + 1);
    };
    (async () => {
      let code: TvCode;
      try {
        code = await tvCode(tvDeviceName(navigator.userAgent));
        if (typeof code?.code !== "string" || !code.secret)
          throw new ApiError(0, "bad_answer");
      } catch (e) {
        if (!alive) return;
        setState({
          stage: "error",
          message:
            e instanceof ApiError && e.code === "network"
              ? "Нет связи с сервером. Проверь интернет на телевизоре."
              : "Вход с телефона сейчас недоступен.",
        });
        timer = window.setTimeout(() => alive && next(), 15_000);
        return;
      }
      if (!alive) return;
      setState({ stage: "waiting", code, note: note.current });
      const until = Date.now() + code.expiresIn * 1000;
      const poll = async () => {
        if (!alive) return;
        if (Date.now() > until) return next();
        try {
          const answer = await tvToken(code.code, code.secret);
          if (!alive) return;
          if (answer.status === "approved" && answer.token) {
            setState({ stage: "signing" });
            try {
              await signInWithTvToken(answer.token);
            } catch (e) {
              if (alive) next(authError(e));
            }
            return;
          }
          if (answer.status === "denied")
            return next("Вход отклонён на телефоне. Вот новый код.");
          if (answer.status !== "pending") return next();
        } catch {
          // A dropped request: try again on the next tick.
        }
        timer = window.setTimeout(poll, code.interval * 1000);
      };
      timer = window.setTimeout(poll, code.interval * 1000);
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [round]);

  return (
    <section className="flex flex-col items-center rounded-3xl border border-hairline bg-card p-6 text-center">
      <h2 className="text-lg">С телефона</h2>
      {state.stage === "waiting" ? (
        <>
          <div className="mt-4">
            <Qr text={linkFor(state.code.code)} />
          </div>
          <p
            className="mt-4 font-mono text-2xl tracking-[0.2em] text-ink"
            aria-label="Код для входа"
          >
            {prettyCode(state.code.code)}
          </p>
          <p className="mt-3 max-w-xs text-sm text-mute">
            Наведи камеру телефона на QR — откроется Umbra. Нажми «Подтвердить».
          </p>
          {state.note ? (
            <p role="status" className="mt-2 text-sm text-accent">
              {state.note}
            </p>
          ) : null}
        </>
      ) : state.stage === "signing" ? (
        <p role="status" className="mt-6 text-mute">
          Телефон подтвердил. Вхожу…
        </p>
      ) : state.stage === "error" ? (
        <p role="alert" className="mt-6 max-w-xs text-sm text-accent">
          {state.message}
        </p>
      ) : (
        <div
          aria-hidden="true"
          className="mt-4 h-[200px] w-[200px] animate-pulse rounded-2xl bg-white/10"
        />
      )}
    </section>
  );
}

const GOOGLE_ERRORS: Record<string, string> = {
  no_account:
    "На телевизоре нет аккаунта Google. Добавь его в настройках телевизора или войди с телефона.",
  failed:
    "Не получилось войти через Google. Попробуй ещё раз или войди с телефона.",
  unsupported: "Не получилось войти через Google. Войди с телефона.",
};

/** The Google account already on the TV, chosen in the system dialog. */
function GoogleOnTv() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () =>
      onTvEvent(async (e) => {
        if (e.type !== "google") return;
        if (e.state === "token") {
          try {
            await signInWithGoogleToken(e.text);
          } catch (err) {
            setError(authError(err));
          }
        } else if (e.text !== "cancelled")
          setError(GOOGLE_ERRORS[e.text] ?? GOOGLE_ERRORS.failed);
        setBusy(false);
      }),
    [],
  );
  return (
    <div className="space-y-3">
      <button
        type="button"
        data-tv-autofocus=""
        disabled={busy}
        onClick={() => {
          setError("");
          setBusy(true);
          startGoogleOnTv();
        }}
        className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-ink px-6 text-lg text-canvas disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-6 w-6">
          <path
            fill="#FFC107"
            d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
          />
          <path
            fill="#FF3D00"
            d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
          />
        </svg>
        {busy ? "Выбери аккаунт…" : "Войти через Google"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Login screen of the TV app: Google on the TV, or the phone via QR. */
export function TvLogin({ error }: { error?: string | null }) {
  const [email, setEmail] = useState(false);
  const google = canGoogleOnTv();
  return (
    <div className="rise mx-auto grid max-w-4xl grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-8 py-4">
      <div>
        <BrandLockup />
        <h1 className="mt-6 text-3xl tracking-tight">Вход в Umbra</h1>
        <p className="mt-2 text-mute">
          Полка, оценки и заметки — те же, что на телефоне.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-accent">
            {error}
          </p>
        ) : null}
        <div className="mt-6 space-y-4">
          {google ? <GoogleOnTv /> : null}
          {email ? (
            <div className="rounded-2xl border border-hairline bg-card p-5">
              <EmailAuth />
            </div>
          ) : (
            <button
              type="button"
              data-tv-autofocus={google ? undefined : ""}
              onClick={() => setEmail(true)}
              className="h-12 w-full rounded-full border border-hairline px-6 text-mute"
            >
              Войти по email и паролю
            </button>
          )}
        </div>
      </div>
      <PhoneSignIn />
    </div>
  );
}
