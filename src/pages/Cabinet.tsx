import { useState } from "react";
import { authError, signOutAccount, useAuth, verifyEmail } from "../lib/auth";
import { useAppState } from "../state";
export function CabinetPage() {
  const { account, error } = useAuth();
  const { items, sync } = useAppState();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  async function action(fn: () => Promise<void>, success = "") {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(success);
    } catch (error) {
      setMessage(authError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rise max-w-2xl space-y-8">
      <h1 className="text-3xl">Мой профиль</h1>
      <section className="space-y-3 rounded-2xl border border-hairline bg-card p-5">
        <p className="text-lg">{account.name}</p>
        <p className="text-sm text-mute">{account.email}</p>
        {!account.verified ? (
          <button
            disabled={busy}
            onClick={() =>
              action(
                verifyEmail,
                "Письмо отправлено. Перейди по ссылке в письме.",
              )
            }
            className="rounded-full border border-hairline px-3 py-2 text-sm"
          >
            Подтвердить почту
          </button>
        ) : (
          <p className="text-xs text-mute">Почта подтверждена</p>
        )}
        <div>
          <button
            disabled={busy}
            onClick={() => action(signOutAccount)}
            className="rounded-full border border-hairline px-3 py-2 text-sm"
          >
            Выйти из аккаунта
          </button>
        </div>
        {sync === "pending" || sync === "offline" ? (
          <p className="text-xs text-mute">
            Несохранённые изменения отправятся в этот аккаунт после подключения
            и входа.
          </p>
        ) : null}
        {message || error ? (
          <p role="status" className="text-sm text-accent">
            {message || error}
          </p>
        ) : null}
      </section>
      <p className="text-sm text-mute">
        На полке {items.length} записей. Чтобы открыть их на другом устройстве,
        войди в тот же аккаунт.
      </p>
    </div>
  );
}
