import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "../components";
import { RequireAccount } from "../components/RequireAccount";
import { FriendsIndexProvider } from "../components/FriendsIndex";
import { UpdatePrompt } from "../components/UpdatePrompt";
import { useTvScreenFocus } from "../components/TvFocus";
import { Tabs } from "./ui";
import { TvCollection, TvHome, TvPerson } from "./screens";
import { TvTitle } from "./TvTitle";

const LoginPage = lazy(() =>
  import("../pages/Login").then((m) => ({ default: m.LoginPage })),
);
const SearchPage = lazy(() =>
  import("../pages/Search").then((m) => ({ default: m.SearchPage })),
);
const TonightPage = lazy(() =>
  import("../pages/Tonight").then((m) => ({ default: m.TonightPage })),
);
const SettingsPage = lazy(() =>
  import("../pages/Settings").then((m) => ({ default: m.SettingsPage })),
);

/**
 * An ordinary page of the site on the TV (search, the evening picker,
 * settings): the TV menu on top, the page below, moved through with the
 * page-wide spatial navigation.
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
      <UpdatePrompt />
    </div>
  );
}

/** The TV app: its own screens for the remote; the site keeps its pages. */
export default function TvApp() {
  return (
    <Routes>
      <Route
        element={
          <Layout bare>
            <Suspense fallback={null}>
              <Outlet />
            </Suspense>
          </Layout>
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
        <Route
          path="/search"
          element={
            <TvPage tab="/search">
              <SearchPage />
            </TvPage>
          }
        />
        <Route
          path="/tonight"
          element={
            <TvPage tab="/tonight">
              <TonightPage />
            </TvPage>
          }
        />
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
