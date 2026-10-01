import { type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  mediaOf,
  posterUrl,
  titleOf,
  type MediaType,
  type TmdbItem,
} from "./lib/tmdb";
import { yearOf } from "./lib/format";
import {
  cachedRating,
  ensureImdbRating,
  subscribeRatings,
} from "./lib/ratings";
import { PLATFORMS } from "./lib/providers";
import { SyncStatus } from "./components/SyncStatus";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { InstallPrompt } from "./components/InstallPrompt";
import { BrandLockup } from "./components/Brand";
import { AccountMenu } from "./components/AccountMenu";

export function Layout({
  children,
  bare = false,
}: {
  children: ReactNode;
  bare?: boolean;
}) {
  const location = useLocation();
  const scrollY = useRef(new Map<string, number>());
  useEffect(() => {
    const saved = scrollY.current.get(location.key);
    window.scrollTo({ top: saved ?? 0, behavior: "auto" });
    return () => {
      scrollY.current.set(location.key, window.scrollY);
    };
  }, [location.key]);

  if (bare)
    return (
      <div
        className="min-h-dvh bg-canvas text-ink"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
          {children}
        </main>
        <UpdatePrompt />
      </div>
    );
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6">
        <SyncStatus />
        {children}
      </main>
      <InstallPrompt />
      <UpdatePrompt />
      <nav className="fixed inset-x-0 bottom-0 z-30 md:hidden">
        <div className="border-t border-hairline bg-[#0c0c0c]/95 backdrop-blur-md">
          <SectionTabs />
        </div>
        <div
          className="bg-[#0c0c0c]"
          style={{ height: "env(safe-area-inset-bottom)" }}
        />
      </nav>
    </div>
  );
}

function TabIcon({ name }: { name: "feed" | "search" | "platforms" | "library" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-[22px] w-[22px]",
    "aria-hidden": true,
  };
  if (name === "feed") {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <path d="M8 5v14M16 5v14" />
      </svg>
    );
  }
  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6" />
        <path d="M15.5 15.5 20 20" />
      </svg>
    );
  }
  if (name === "platforms") {
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M6 4.5h12a1 1 0 0 1 1 1V20l-7-3.5L5 20V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function SectionTabs() {
  const { pathname } = useLocation();
  const games = pathname.startsWith("/games");
  const tabs = games
    ? [
        { to: "/games", label: "Лента", icon: "feed" as const, end: true },
        { to: "/games/search", label: "Поиск", icon: "search" as const },
        {
          to: "/games/platforms",
          label: "Платформы",
          icon: "platforms" as const,
        },
        { to: "/games/library", label: "Коллекция", icon: "library" as const },
      ]
    : [
        { to: "/", label: "Лента", icon: "feed" as const, end: true },
        { to: "/search", label: "Поиск", icon: "search" as const },
        { to: "/platforms", label: "Платформы", icon: "platforms" as const },
        { to: "/library", label: "Коллекция", icon: "library" as const },
      ];
  return (
    <div className="grid h-16 grid-cols-4">
      {tabs.map((tab) => (
        <Tab key={tab.to} {...tab} />
      ))}
    </div>
  );
}

function Tab({
  to,
  label,
  icon,
  end,
}: {
  to: string;
  label: string;
  icon: "feed" | "search" | "platforms" | "library";
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex h-full flex-col items-center justify-center gap-1 ${isActive ? "text-ink" : "text-dim"}`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`absolute top-0 h-0.5 w-7 rounded-full ${isActive ? "bg-accent" : "bg-transparent"}`}
          />
          <span className={isActive ? "text-accent" : "text-dim"}>
            <TabIcon name={icon} />
          </span>
          <span
            className={`max-w-full truncate px-1 font-mono text-[10px] leading-none uppercase tracking-[0.08em] ${isActive ? "text-ink" : "text-dim"}`}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

function canGoBack() {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === "number" && idx > 0;
}

function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const home = location.pathname === "/" || location.pathname === "/games";
  if (home) return null;
  return (
    <button
      type="button"
      aria-label="Назад"
      onClick={() => {
        if (canGoBack()) navigate(-1);
        else if (location.pathname !== "/") navigate("/");
      }}
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-card px-2.5 text-mute sm:px-3"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px] text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14.5 6.5 8.5 12l6 5.5" />
      </svg>
      <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] sm:inline">
        Назад
      </span>
    </button>
  );
}

function ModeSwitch() {
  const { pathname } = useLocation();
  const games = pathname.startsWith("/games");
  const item = (active: boolean) =>
    `flex h-8 items-center rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.12em] ${active ? "bg-ink text-canvas" : "text-mute"}`;
  return (
    <div className="ml-auto flex h-10 shrink-0 items-center rounded-full border border-hairline bg-card p-1">
      <Link to="/" className={item(!games)}>
        Фильмы
      </Link>
      <Link to="/games" className={item(games)}>
        Игры
      </Link>
    </div>
  );
}

function Header() {
  const { pathname } = useLocation();
  const games = pathname.startsWith("/games");
  const links = games
    ? [
        { to: "/games", label: "Лента", end: true },
        { to: "/games/search", label: "Поиск" },
        { to: "/games/platforms", label: "Платформы" },
        { to: "/games/library", label: "Коллекция" },
      ]
    : [
        { to: "/", label: "Лента", end: true },
        { to: "/search", label: "Поиск" },
        { to: "/platforms", label: "Платформы" },
        { to: "/library", label: "Коллекция" },
        { to: "/guide", label: "Справочник" },
      ];
  return (
    <header
      className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <BackButton />
        <Link to="/" className="inline-flex shrink-0 items-center">
          <BrandLockup />
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-mute md:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                isActive ? "text-ink" : "hover:text-ink"
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <ModeSwitch />
        <AccountMenu />
      </div>
    </header>
  );
}

export function RatingBadge({ type, id }: { type: MediaType; id: number }) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeRatings(() => setTick((n) => n + 1)), []);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void ensureImdbRating(type, id).catch(() => undefined);
        }
      },
      { rootMargin: "150px" },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [type, id]);
  const score = cachedRating(type, id).imdb;
  if (!score) return <div ref={root} className="absolute bottom-1.5 right-1.5" />;
  return (
    <div
      ref={root}
      className="absolute bottom-1.5 right-1.5 rounded-md bg-black/75 px-1.5 py-0.5 leading-none backdrop-blur-sm"
    >
      <p
        className="font-mono text-sm font-bold text-[#f5c518]"
        aria-label={`IMDb ${score}`}
      >
        {score}
      </p>
    </div>
  );
}

export function PersonLink({
  id,
  name,
  className = "",
}: {
  id: number;
  name: string;
  className?: string;
}) {
  return (
    <Link
      to={`/person/${id}`}
      className={`text-ink underline decoration-hairline underline-offset-4 hover:decoration-accent ${className}`}
    >
      {name}
    </Link>
  );
}

export function PosterCard({
  item,
  type,
  layout = "row",
}: {
  item: TmdbItem;
  type?: MediaType;
  layout?: "row" | "grid";
}) {
  const media = mediaOf(item, type);
  const poster = posterUrl(item.poster_path);
  const year = yearOf(item.release_date || item.first_air_date);
  return (
    <Link
      to={`/title/${media}/${item.id}`}
      className={`group block ${layout === "grid" ? "w-full" : "w-[42vw] shrink-0 sm:w-40"}`}
    >
      <div className="poster-hover relative overflow-hidden rounded-xl border border-hairline bg-card">
        {poster ? (
          <img
            src={poster}
            alt={titleOf(item)}
            className="aspect-[2/3] w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-[2/3] items-end p-3 text-sm text-mute">
            {titleOf(item)}
          </div>
        )}
        <RatingBadge type={media} id={item.id} />
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="line-clamp-2 text-sm leading-snug">{titleOf(item)}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
          {media === "tv" ? "сериал" : "фильм"}
          {year ? ` · ${year}` : ""}
        </p>
      </div>
    </Link>
  );
}

export function Row({
  title,
  items,
  type,
  to,
}: {
  title: string;
  items: TmdbItem[];
  type?: MediaType;
  to?: string;
}) {
  if (!items.length) return null;
  return (
    <section className="rise mb-10">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        {to ? (
          <Link
            to={to}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent"
          >
            Все
          </Link>
        ) : null}
      </div>
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {items
          .filter((i) => i.media_type !== "person")
          .map((item) => (
            <PosterCard
              key={`${mediaOf(item, type)}-${item.id}`}
              item={item}
              type={type}
            />
          ))}
        {to ? (
          <Link
            to={to}
            className="flex w-[42vw] shrink-0 flex-col items-center justify-center rounded-xl border border-hairline bg-card text-center sm:w-40"
          >
            <span className="text-2xl text-accent">→</span>
            <span className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
              Ещё
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function Grid({ items, type }: { items: TmdbItem[]; type?: MediaType }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items
        .filter((i) => i.media_type !== "person")
        .map((item) => (
          <PosterCard
            key={`${mediaOf(item, type)}-${item.id}`}
            item={item}
            type={type}
            layout="grid"
          />
        ))}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-16 text-center text-sm text-mute">{text}</p>;
}

export function PlatformChip({ id }: { id: number }) {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p) return null;
  return (
    <Link
      to={`/platforms/${p.slug}`}
      className="inline-flex items-center gap-2 rounded-full border border-hairline bg-card px-3 py-1 text-xs text-mute hover:text-ink"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: p.tint }}
      />
      {p.name}
    </Link>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    Promise.resolve()
      .then(fn)
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, deps);
  return { data, error, loading };
}

export function ErrorBox({ code }: { code: string }) {
  if (code === "BAD_KEY") {
    return (
      <div className="rounded-2xl border border-hairline bg-card p-6 text-sm text-mute">
        Не удалось подключить каталог TMDB.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-hairline bg-card p-6 text-sm text-mute">
      Не удалось загрузить данные (
      {code === "NETWORK" ? "проверь подключение к интернету" : code}).
    </div>
  );
}
