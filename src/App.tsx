import { lazy, Suspense } from "react";
import { RequireAccount } from "./components/RequireAccount";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components";
const FeedPage = lazy(() =>
  import("./pages/Feed").then((m) => ({ default: m.FeedPage })),
);
const GuidePage = lazy(() =>
  import("./pages/Guide").then((m) => ({ default: m.GuidePage })),
);
const GuideListPage = lazy(() =>
  import("./pages/Guide").then((m) => ({ default: m.GuideListPage })),
);
const HomePage = lazy(() =>
  import("./pages/Home").then((m) => ({ default: m.HomePage })),
);
const LibraryPage = lazy(() =>
  import("./pages/Library").then((m) => ({ default: m.LibraryPage })),
);
const LoginPage = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.LoginPage })),
);
const PersonPage = lazy(() =>
  import("./pages/Person").then((m) => ({ default: m.PersonPage })),
);
const PlatformPage = lazy(() =>
  import("./pages/Platforms").then((m) => ({ default: m.PlatformPage })),
);
const PlatformsPage = lazy(() =>
  import("./pages/Platforms").then((m) => ({ default: m.PlatformsPage })),
);
const SearchPage = lazy(() =>
  import("./pages/Search").then((m) => ({ default: m.SearchPage })),
);
const CabinetPage = lazy(() =>
  import("./pages/Cabinet").then((m) => ({ default: m.CabinetPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.SettingsPage })),
);
const TitlePage = lazy(() =>
  import("./pages/Title").then((m) => ({ default: m.TitlePage })),
);

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<p role="status">Загружаю экран…</p>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/feed/:id" element={<FeedPage />} />
          <Route path="/platforms" element={<PlatformsPage />} />
          <Route path="/platforms/:slug" element={<PlatformPage />} />
          <Route
            path="/library"
            element={
              <RequireAccount>
                <LibraryPage />
              </RequireAccount>
            }
          />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/guide/year/:year" element={<GuideListPage />} />
          <Route path="/guide/:genreId" element={<GuideListPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/cabinet"
            element={
              <RequireAccount>
                <CabinetPage />
              </RequireAccount>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/title/:type/:id" element={<TitlePage />} />
          <Route path="/person/:id" element={<PersonPage />} />
          <Route
            path="*"
            element={<p>Страница не найдена. Выбери раздел в меню.</p>}
          />
        </Routes>
      </Suspense>
    </Layout>
  );
}
