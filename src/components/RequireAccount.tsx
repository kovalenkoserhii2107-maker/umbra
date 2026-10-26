import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { LoadingMotion } from "./LoadingMotion";
export function RequireAccount({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === "initializing")
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
        <LoadingMotion kind="auth" label="Восстанавливаю вход…" />
      </div>
    );
  if (!auth.account)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  return children;
}
