import { Navigate, useSearchParams } from "react-router-dom";
import { BrandLockup } from "../components/Brand";
import { EmailAuth } from "../components/EmailAuth";
import { GoogleSignIn } from "../components/GoogleSignIn";
import { safeReturnPath, useAuth } from "../lib/auth";
export function LoginPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const next = safeReturnPath(params.get("next"));
  if (auth.status === "initializing")
    return <p role="status">Восстанавливаю вход…</p>;
  if (auth.account) return <Navigate to={next} replace />;
  return (
    <div className="rise mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-2 text-center">
      <BrandLockup size="lg" />
      <h1 className="mt-8 text-3xl">Вход в Umbra</h1>
      <p className="mt-3 text-sm text-mute">
        Твои фильмы, оценки и заметки — на телефоне и компьютере. На всех
        устройствах входи в один аккаунт.
      </p>
      {auth.error ? (
        <p role="alert" className="mt-3 text-accent">
          {auth.error}
        </p>
      ) : null}
      <div className="mt-8 w-full space-y-5 rounded-2xl border border-hairline bg-card p-6">
        <GoogleSignIn />
        <p className="text-xs text-dim">или</p>
        <EmailAuth />
      </div>
    </div>
  );
}
