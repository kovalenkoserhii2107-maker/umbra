import { useEffect, useState } from "react";
import {
  isIos,
  isStandalone,
  promptInstall,
  rememberDismissal,
  shouldAutoOpen,
  useCanInstall,
} from "../lib/install";

/** Mounted only after sign-in, so a new person sees it right after joining. */
export function InstallPrompt() {
  const canInstall = useCanInstall();
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    const help = () => setOpen(true);
    window.addEventListener("umbra:install-help", help);
    return () => window.removeEventListener("umbra:install-help", help);
  }, []);

  useEffect(() => {
    // Chrome may offer installation before sign-in; the event is kept for here.
    if (!asked && (canInstall || isIos()) && shouldAutoOpen()) {
      const timer = window.setTimeout(() => {
        setAsked(true);
        setOpen(true);
      }, 600);
      return () => window.clearTimeout(timer);
    }
  }, [canInstall, asked]);

  function dismiss() {
    rememberDismissal();
    setOpen(false);
  }

  async function install() {
    // Declining Chrome's dialog counts as "Позже".
    if ((await promptInstall()) === "dismissed") rememberDismissal();
    setOpen(false);
  }

  if (!open || isStandalone()) return null;

  const ios = isIos();

  return (
    <div
      className="fixed inset-x-0 z-50 px-4"
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
    >
      <div className="rise mx-auto max-w-xl rounded-2xl border border-hairline bg-card/95 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <div className="flex items-start gap-3">
          <img
            src={`${import.meta.env.BASE_URL}icon-192.png`}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Установить Umbra</p>
            {ios ? (
              <ol className="mt-2 space-y-1.5 text-xs leading-5 text-mute">
                <li>1. Нажми кнопку «Поделиться» внизу Safari</li>
                <li>2. Выбери «На экран «Домой»»</li>
                <li>3. Подтверди «Добавить»</li>
              </ol>
            ) : (
              <p className="mt-1 text-xs text-mute">
                {canInstall
                  ? "Umbra откроется как приложение — без адресной строки, с иконкой на главном экране."
                  : "Открой меню браузера (⋮) и выбери «Установить приложение» или «Добавить на главный экран»."}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={dismiss}
            className="rounded-full px-3 py-1.5 text-xs text-dim"
          >
            Позже
          </button>
          {ios || !canInstall ? null : (
            <button
              onClick={install}
              className="rounded-full bg-ink px-3 py-1.5 text-xs text-canvas"
            >
              Установить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
