import { useAppState } from "../state";
import { useAuth } from "../lib/auth";
export function SyncStatus() {
  const { account } = useAuth();
  const { sync, syncError, retrySync } = useAppState();
  if (!account && !syncError) return null;
  const labels = {
    "signed-out": "",
    connecting: "Подключаю полку…",
    synced: "Все изменения сохранены",
    pending: "Сохраняю изменения…",
    offline: "Нет сети · изменения отправятся после подключения",
    error: "Не удалось синхронизировать полку",
  };
  return (
    <div
      role={syncError ? "alert" : "status"}
      className="mb-4 flex flex-wrap items-center gap-3 text-xs text-mute"
    >
      <span>{syncError || labels[sync]}</span>
      {syncError ? (
        <button onClick={retrySync} className="underline">
          Проверить соединение
        </button>
      ) : null}
    </div>
  );
}
