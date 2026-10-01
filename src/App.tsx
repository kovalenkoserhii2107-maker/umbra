import { lazy, Suspense } from "react";
import { RequireAccount } from "./components/RequireAccount";
import { Outlet, Route, Routes } from "react-router-dom";
import { Layout } from "./components";
const FeedPage = lazy(() =>
  import("./pages/Feed").then((m) => ({ default: m.FeedPage })),
);
const GamesPage = lazy(() =>
  import("./pages/Games").then((m) => ({ default: m.GamesPage })),
);
const GamePage = lazy(() =>
  import("./pages/Games").then((m) => ({ default: m.GamePage })),
);
const GameSearchPage = lazy(() =>
  import("./pages/GameSection").then((m) => ({ default: m.GameSearchPage })),
);
const GamePlatformsPage = lazy(() =>
  import("./pages/GameSection").then((m) => ({ default: m.GamePlatformsPage })),
);
const GamePlatformPage = lazy(() =>
  import("./pages/GameSection").then((m) => ({ default: m.GamePlatformPage })),
);
const StudioPage = lazy(() =>
  import("./pages/GameSection").then((m) => ({ default: m.StudioPage })),
);
const GameFindPage = lazy(() =>
  import("./pages/GameSection").then((m) => ({ default: m.GameFindPage })),
);
const GameLibraryPage = lazy(() =>
  import("./pages/GameSection").then((m) => ({ default: m.GameLibraryPage })),
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
const StatsPage = lazy(() =>
  import("./pages/Stats").then((m) => ({ default: m.StatsPage })),
);
const FriendsPage = lazy(() =>
  import("./pages/Friends").then((m) => ({ default: m.FriendsPage })),
);
const FriendPage = lazy(() =>
  import("./pages/Friends").then((m) => ({ default: m.FriendPage })),
);
const InvitePage = lazy(() =>
  import("./pages/Friends").then((m) => ({ default: m.InvitePage })),
);
const TitlePage = lazy(() =>
  import("./pages/Title").then((m) => ({ default: m.TitlePage })),
);

function Screen() {
  return (
    <Suspense fallback={<p role="status">Загружаю экран…</p>}>
      <Outlet />
    </Suspense>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        element={
          <Layout bare>
            <Screen />
          </Layout>
        }
      >
        <Route path="/login" element={<LoginPage />} />
      </Route>
      {/* The whole catalog opens only after sign-in or registration. */}
      <Route
        element={
          <RequireAccount>
            <Layout>
              <Screen />
            </Layout>
          </RequireAccount>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/feed/:id" element={<FeedPage />} />
        <Route path="/platforms" element={<PlatformsPage />} />
        <Route path="/platforms/:slug" element={<PlatformPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/friends/invite/:uid" element={<InvitePage />} />
        <Route path="/friends/:uid" element={<FriendPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/search" element={<GameSearchPage />} />
        <Route path="/games/platforms" element={<GamePlatformsPage />} />
        <Route path="/games/platforms/:id" element={<GamePlatformPage />} />
        <Route path="/games/library" element={<GameLibraryPage />} />
        <Route path="/games/find" element={<GameFindPage />} />
        <Route path="/games/studio/:name" element={<StudioPage />} />
        <Route path="/games/:id" element={<GamePage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/guide/year/:year" element={<GuideListPage />} />
        <Route path="/guide/:genreId" element={<GuideListPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/cabinet" element={<CabinetPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/title/:type/:id" element={<TitlePage />} />
        <Route path="/person/:id" element={<PersonPage />} />
        <Route
          path="*"
          element={<p>Страница не найдена. Выбери раздел в меню.</p>}
        />
      </Route>
    </Routes>
  );
}
