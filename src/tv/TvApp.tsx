import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { RequireAccount } from "../components/RequireAccount";
import { FriendsIndexProvider } from "../components/FriendsIndex";
import { UpdatePrompt } from "../components/UpdatePrompt";
import { useTvScreenFocus } from "../components/TvFocus";
import { Tabs } from "./ui";
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
export default function TvApp() {
  return (
    <>
      {/* New versions of the site apply by themselves on the TV. */}
      <UpdatePrompt />
      <TvRoutes />
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
