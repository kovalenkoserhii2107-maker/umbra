import { Navigate, useSearchParams } from "react-router-dom";
import { BrandLockup } from "../components/Brand";
import { EmailAuth } from "../components/EmailAuth";
import { GoogleSignIn } from "../components/GoogleSignIn";
import { LoadingMotion } from "../components/LoadingMotion";
import { safeReturnPath, useAuth } from "../lib/auth";
import { isTv } from "../lib/tvMode";
import { TvLogin } from "../components/TvLogin";
export function LoginPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const next = safeReturnPath(params.get("next"));
  if (auth.status === "initializing")
    return (
      <div className="flex min-h-[70dvh] items-center justify-center px-4">
        <LoadingMotion kind="auth" label="Відновлюю вхід…" />
      </div>
    );
  if (auth.account) return <Navigate to={next} replace />;
  if (isTv) return <TvLogin error={auth.error} />;
  return (
    <div className="rise mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-2 text-center">
      <BrandLockup size="lg" />
      <h1 className="mt-8 text-3xl">Вхід в Umbra</h1>
      <p className="mt-3 text-sm text-mute">
        Увійди або зареєструйся, щоб відкрити каталог фільмів, серіалів та
        ігор. Оцінки та нотатки синхронізуються між пристроями одного
        акаунту.
      </p>
      {auth.error ? (
        <p role="alert" className="mt-3 text-accent">
          {auth.error}
        </p>
      ) : null}
      <div className="mt-8 w-full space-y-5 rounded-2xl border border-hairline bg-card p-6">
        <GoogleSignIn />
        <p className="text-xs text-dim">або</p>
        <EmailAuth />
      </div>
    </div>
  );
}
