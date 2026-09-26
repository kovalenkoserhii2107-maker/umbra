import { useState } from "react";
import { authError, signInWithGoogle } from "../lib/auth";
export function GoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enter() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (error) {
      setError(authError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy}
        onClick={enter}
        className="w-full rounded-full bg-ink px-4 py-3 text-sm text-canvas disabled:opacity-60"
      >
        {busy ? "Открываю Google…" : "Продолжить с Google"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}
