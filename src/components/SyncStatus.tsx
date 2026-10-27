import { useEffect, useRef, useState } from "react";
import { useAppState } from "../state";
import { useAuth } from "../lib/auth";

export function SyncStatus() {
  const { account } = useAuth();
  const { sync, syncError, retrySync } = useAppState();
  const changed = useRef(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (sync === "pending" || sync === "offline") changed.current = true;
    if (sync !== "synced" || !changed.current) {
      setShowSaved(false);
      return;
    }
    setShowSaved(true);
    const timer = window.setTimeout(() => setShowSaved(false), 2200);
    return () => window.clearTimeout(timer);
  }, [sync]);

  if (!account && !syncError) return null;

  const bannerLabel =
    syncError ||
    (sync === "offline"
      ? "Немає мережі · зміни відправляться після підключення"
      : sync === "error"
        ? "Не вдалося синхронізувати полицю"
        : "");

  if (bannerLabel) {
    return (
      <div
        role={syncError ? "alert" : "status"}
        className="mb-4 flex flex-wrap items-center gap-3 text-xs text-mute"
      >
        <span>{bannerLabel}</span>
        {syncError ? (
          <button onClick={retrySync} className="underline">
            Перевірити з'єднання
          </button>
        ) : null}
      </div>
    );
  }

  const toastLabel =
    sync === "pending"
      ? "Зберігаю зміни…"
      : showSaved
        ? "Усі зміни збережено"
        : "";
  if (!toastLabel) return null;

  return (
    <div
      role="status"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
      className="pointer-events-none fixed right-4 z-40 rounded-full border border-hairline bg-card/95 px-3.5 py-1.5 text-xs text-mute shadow-lg backdrop-blur-md md:bottom-6"
    >
      {toastLabel}
    </div>
  );
}