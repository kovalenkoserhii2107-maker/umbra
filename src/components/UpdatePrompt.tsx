import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useAppState } from "../state";
import { isTv } from "../lib/tvMode";
export function UpdatePrompt() {
  const { sync } = useAppState();
  const [error, setError] = useState(false);
  const {
    needRefresh: [ready, setReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () => setError(true),
  });
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const check = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void navigator.serviceWorker
        .getRegistration(import.meta.env.BASE_URL)
        .then((reg) => reg?.update())
        .catch(() => setError(true));
    };
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, []);
  // On the TV nobody taps «Обновить»: a new version applies by itself, once
  // nothing is waiting to be saved.
  useEffect(() => {
    if (isTv && ready && sync !== "pending")
      void updateServiceWorker(true).catch(() => undefined);
  }, [ready, sync]);
  if (isTv) return null;
  if (!ready && !error) return null;
  return (
    <aside
      role="status"
      className="fixed bottom-24 right-4 z-50 max-w-sm rounded-2xl border border-hairline bg-card p-4 shadow-xl"
    >
      <p className="text-sm">
        {ready
          ? "Доступна новая версия Umbra"
          : "Не удалось включить работу без сети. Проверь соединение."}
      </p>
      <div className="mt-3 flex gap-3 text-sm">
        {ready ? (
          <button
            disabled={sync === "pending"}
            onClick={() => {
              void updateServiceWorker(true).catch(() => setError(true));
            }}
            className="text-accent disabled:opacity-50"
          >
            {sync === "pending" ? "Сохраняю изменения…" : "Обновить"}
          </button>
        ) : null}
        <button
          onClick={() => {
            setReady(false);
            setError(false);
          }}
        >
          Позже
        </button>
      </div>
    </aside>
  );
}
