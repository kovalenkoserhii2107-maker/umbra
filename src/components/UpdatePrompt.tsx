import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useAppState } from "../state";
import { isTv } from "../lib/tvMode";

export function UpdatePrompt() {
  const { sync } = useAppState();
  const [error, setError] = useState(false);
  const applying = useRef(false);
  const {
    needRefresh: [ready, setReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () => {
      if (!navigator.serviceWorker?.controller) setError(true);
    },
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const check = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration(
          import.meta.env.BASE_URL,
        );
        if (!reg || reg.installing) return;
        const res = await fetch(`${import.meta.env.BASE_URL}sw.js`, {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (res.ok) await reg.update();
      } catch {
        // Ignore transient network hiccups during background update checks.
      }
    };
    void navigator.serviceWorker.ready
      .then(() => check())
      .catch(() => undefined);
    const timer = setInterval(() => {
      void check();
    }, 60_000);
    const onVisible = () => {
      void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, []);

  // Apply downloaded updates automatically on phone, desktop and TV once no
  // local library changes are waiting to sync to Firestore.
  useEffect(() => {
    if (!ready || sync === "pending" || applying.current) return;
    applying.current = true;
    void updateServiceWorker(true).catch(() => {
      applying.current = false;
      setError(true);
    });
  }, [ready, sync, updateServiceWorker]);

  if (isTv) return null;
  if (!error && !(ready && sync === "pending")) return null;
  return (
    <aside
      role="status"
      className="fixed bottom-24 right-4 z-50 max-w-sm rounded-2xl border border-hairline bg-card p-4 shadow-xl"
    >
      <p className="text-sm">
        {ready
          ? "Доступна нова версія Umbra"
          : "Не вдалося увімкнути роботу без мережі. Перевір з'єднання."}
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
            {sync === "pending" ? "Зберігаю зміни…" : "Оновити"}
          </button>
        ) : null}
        <button
          onClick={() => {
            setReady(false);
            setError(false);
          }}
        >
          Пізніше
        </button>
      </div>
    </aside>
  );
}
