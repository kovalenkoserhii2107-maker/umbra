import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { RequireAccount } from "../components/RequireAccount";
import { FriendsIndexProvider } from "../components/FriendsIndex";
import { UpdatePrompt } from "../components/UpdatePrompt";
import { tvRegister, tvUnregister, type TvRemoteInfo } from "../lib/api";
import { idToken, onBeforeSignOut, useAuth } from "../lib/auth";
import { exitTvApp, onTvEvent, setTvRootBack, tvBridge } from "../lib/tvMode";
import { useTvScreenFocus } from "../components/TvFocus";
import { TABS, Tabs } from "./ui";
import { TvCollection, TvHome, TvPerson } from "./screens";
import { TvTitle } from "./TvTitle";
import { TvTonight } from "./TvTonight";
import { TvSearch } from "./TvSearch";

const LoginPage = lazy(() =>
  import("../pages/Login").then((m) => ({ default: m.LoginPage })),
);
const SettingsPage = lazy(() =>
  import("../pages/Settings").then((m) => ({ default: m.SettingsPage })),
);

/**
 * An ordinary page of the site on the TV (settings): the TV menu on top,
 * the page below, moved through with the page-wide spatial navigation.
 */
function TvPage({ tab, children }: { tab: string; children: ReactNode }) {
  const location = useLocation();
  useTvScreenFocus(`${location.key} ${location.pathname}`);
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <Tabs active={tab} links />
      <main className="px-12 pb-16 pt-4">
        <FriendsIndexProvider>
          <Suspense fallback={<p role="status">Загружаю…</p>}>
            {children}
          </Suspense>
        </FriendsIndexProvider>
      </main>
    </div>
  );
}

/** The sign-in screen: no menu, focus on its first button. */
function TvBare({ children }: { children: ReactNode }) {
  const location = useLocation();
  useTvScreenFocus(`${location.key} ${location.pathname}`);
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-16 pt-6 text-ink">
      <main className="mx-auto w-full max-w-6xl">
        <Suspense fallback={null}>{children}</Suspense>
      </main>
    </div>
  );
}

/** The TV app: its own screens for the remote; the site keeps its pages. */
/**
 * This TV, signed in, can be reached from the phone («На телевизоре в
 * Lampa»): the app's push token goes to the worker, again when it changes.
 */
function useRemoteRegistration() {
  const { account } = useAuth();
  const uid = account?.sub;
  useEffect(() => {
    if (!uid) return;
    let sent = "";
    let registeredId = "";
    const readInfo = (): TvRemoteInfo | null => {
      try {
        return JSON.parse(
          tvBridge()?.remoteInfo?.() || "null",
        ) as TvRemoteInfo | null;
      } catch {
        return null;
      }
    };
    const register = () => {
      const info = readInfo();
      if (!info?.token || !info.id) return;
      const key = JSON.stringify(info);
      if (key === sent) return;
      sent = key;
      registeredId = info.id;
      void idToken()
        .then((token) => tvRegister(info, token))
        .catch(() => {
          sent = "";
        });
    };
    register();
    const stopEvent = onTvEvent((e) => {
      if (e.type === "remote") register();
    });
    const stopSignOut = onBeforeSignOut(async () => {
      const id = registeredId || readInfo()?.id;
      if (!id) return;
      const token = await idToken();
      if (token) await tvUnregister(id, token).catch(() => undefined);
    });
    return () => {
      stopEvent();
      stopSignOut();
    };
  }, [uid]);
}

/** Back twice within this time on «Лента» leaves the app. */
const LEAVE_MS = 2000;

/**
 * Back with nothing open on the screen: on another tab of the menu it goes
 * to «Лента» (the app never closes from there); on «Лента» the first press
 * says how to leave and a second one soon after closes the app. Title and
 * person pages keep going back in history.
 */
function useRootBack() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hint, setHint] = useState(false);
  const path = useRef(location.pathname);
  path.current = location.pathname;
  const armed = useRef(0);
  useEffect(() => {
    let timer = 0;
    setTvRootBack(() => {
      const here = path.current;
      if (here !== "/" && TABS.some((t) => t.to === here)) {
        navigate("/", { replace: true, state: { menu: true } });
        return true;
      }
      if (here !== "/") return false;
      window.clearTimeout(timer);
      if (Date.now() - armed.current < LEAVE_MS) {
        armed.current = 0;
        setHint(false);
        // An app from before exitApp closes by itself when this is false.
        return exitTvApp();
      }
      armed.current = Date.now();
      setHint(true);
      timer = window.setTimeout(() => setHint(false), LEAVE_MS);
      return true;
    });
    return () => {
      window.clearTimeout(timer);
      setTvRootBack(null);
    };
  }, []);
  return hint;
}

export default function TvApp() {
  useRemoteRegistration();
  const leaving = useRootBack();
  return (
    <>
      {/* New versions of the site apply by themselves on the TV. */}
      <UpdatePrompt />
      <TvRoutes />
      {leaving ? (
        <p
          role="status"
          className="tv-rise fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/80 px-6 py-3 text-[16px] text-ink shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
        >
          Нажмите «Назад» ещё раз, чтобы выйти
        </p>
      ) : null}
    </>
  );
}

function TvRoutes() {
  return (
    <Routes>
      <Route
        element={
          <TvBare>
            <Outlet />
          </TvBare>
        }
      >
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route
        element={
          <RequireAccount>
            <Outlet />
          </RequireAccount>
        }
      >
        <Route path="/" element={<TvHome />} />
        <Route path="/library" element={<TvCollection />} />
        <Route path="/title/:type/:id" element={<TvTitle />} />
        <Route path="/person/:id" element={<TvPerson />} />
        <Route path="/search" element={<TvSearch />} />
        <Route path="/tonight" element={<TvTonight />} />
        <Route
          path="/settings"
          element={
            <TvPage tab="/settings">
              <SettingsPage />
            </TvPage>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
