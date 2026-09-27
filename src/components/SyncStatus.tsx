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
  const label =
    syncError ||
    (sync === "connecting"
      ? "Подключаю полку…"
      : sync === "pending"
        ? "Сохраняю изменения…"
        : sync === "offline"
          ? "Нет сети · изменения отправятся после подключения"
          : sync === "error"
            ? "Не удалось синхронизировать полку"
            : showSaved
              ? "Все изменения сохранены"
              : "");
  if (!label) return null;
  return (
    <div
      role={syncError ? "alert" : "status"}
      className="mb-4 flex flex-wrap items-center gap-3 text-xs text-mute"
    >
      <span>{label}</span>
      {syncError ? (
        <button onClick={retrySync} className="underline">
          Проверить соединение
        </button>
      ) : null}
    </div>
  );
}