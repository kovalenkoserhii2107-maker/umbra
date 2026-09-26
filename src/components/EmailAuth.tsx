import { useState, type FormEvent } from "react";
import {
  authError,
  registerWithEmail,
  resetPassword,
  signInWithEmail,
} from "../lib/auth";
export function EmailAuth() {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "register") await registerWithEmail(email, password, name);
      else if (mode === "login") await signInWithEmail(email, password);
      else {
        await resetPassword(email);
        setMessage(
          "Если для этой почты доступно восстановление, мы отправили письмо. Проверь также «Спам».",
        );
      }
    } catch (error) {
      setMessage(authError(error));
    } finally {
      setBusy(false);
    }
  }
  const field =
    "mt-1 w-full rounded-2xl border border-hairline bg-canvas px-4 py-3 text-sm outline-none focus:border-accent";
  function change(next: typeof mode) {
    setMode(next);
    setMessage("");
    setPassword("");
  }
  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <fieldset disabled={busy} className="space-y-3">
        {mode === "register" ? (
          <label className="block text-sm">
            Имя
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={100}
            />
          </label>
        ) : null}
        <label className="block text-sm">
          Email
          <input
            className={field}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        {mode !== "reset" ? (
          <label className="block text-sm">
            Пароль
            <input
              className={field}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              minLength={mode === "register" ? 8 : undefined}
              required
            />
          </label>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-full border border-hairline px-4 py-3 text-sm disabled:opacity-60"
        >
          {busy
            ? "Подожди…"
            : mode === "register"
              ? "Создать аккаунт"
              : mode === "reset"
                ? "Восстановить пароль"
                : "Войти по почте"}
        </button>
        <button
          type="button"
          onClick={() => change(mode === "login" ? "register" : "login")}
          className="w-full text-center text-xs text-mute"
        >
          {mode === "login"
            ? "Нет аккаунта — зарегистрироваться"
            : "Вернуться ко входу"}
        </button>
        {mode === "login" ? (
          <button
            type="button"
            onClick={() => change("reset")}
            className="w-full text-center text-xs text-mute"
          >
            Забыли пароль?
          </button>
        ) : null}
      </fieldset>
      {message ? (
        <p role="status" className="text-sm text-accent">
          {message}
        </p>
      ) : null}
    </form>
  );
}
