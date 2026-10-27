import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isTv } from "../lib/tvMode";
import { useAppState } from "../state";
import { LoadingMotion } from "./LoadingMotion";

const StartupReadyContext = createContext<() => void>(() => {});

export function useMarkStartupReady() {
  return useContext(StartupReadyContext);
}

export function RequireAccount({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { libraryReady } = useAppState();
  const location = useLocation();
  const uid = auth.account?.sub || null;

  const [homeSettledUid, setHomeSettledUid] = useState<string | null>(null);
  const markHomeReady = useCallback(() => {
    if (uid) setHomeSettledUid(uid);
  }, [uid]);

  const anonymous = auth.status !== "initializing" && !auth.account;
  const canMountApp =
    auth.status !== "initializing" && Boolean(auth.account) && libraryReady;
  const waitingForHome = !isTv && location.pathname === "/";
  const curtainActive =
    !anonymous && (!canMountApp || (waitingForHome && homeSettledUid !== uid));

  const [keepCurtain, setKeepCurtain] = useState(curtainActive);

  useEffect(() => {
    if (!canMountApp || !uid) return;
    if (!waitingForHome) {
      setHomeSettledUid(uid);
      return;
    }
    if (homeSettledUid === uid) return;
    const timer = window.setTimeout(() => setHomeSettledUid(uid), 750);
    return () => window.clearTimeout(timer);
  }, [canMountApp, uid, waitingForHome, homeSettledUid]);

  useEffect(() => {
    if (curtainActive) {
      setKeepCurtain(true);
      return;
    }
    const timer = window.setTimeout(() => setKeepCurtain(false), 220);
    return () => window.clearTimeout(timer);
  }, [curtainActive]);

  if (anonymous) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  const showOverlay = curtainActive || keepCurtain;

  return (
    <StartupReadyContext.Provider value={markHomeReady}>
      {canMountApp ? children : null}
      {showOverlay ? (
        <div
          aria-hidden={!curtainActive || undefined}
          className={`fixed inset-0 z-50 flex items-center justify-center bg-canvas px-4 transition-opacity duration-200 ${
            curtainActive ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <LoadingMotion kind="auth" label="Відновлюю вхід…" />
        </div>
      ) : null}
    </StartupReadyContext.Provider>
  );
}
