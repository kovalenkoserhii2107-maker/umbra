import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorBox } from "../components";
import { catalog, profileUrl, type PersonHit } from "../lib/catalog";
import {
  ERAS,
  FAMES,
  LANGUAGES,
  MINE,
  PRESETS,
  RUNTIMES,
  SCORE_STEPS,
  SEARCH_GENRES,
  applySearch,
  countFilters,
  defaultFilters,
  filtersFromParams,
  filtersToParams,
  forgetSearches,
  recentSearches,
  rememberSearch,
  splitYear,
  switchLayout,
  type SearchFilters,
  type SearchSort,
} from "../lib/search";
import { kindOf, posterUrl, titleOf, tmdb, type TmdbItem } from "../lib/tmdb";
import { yearOf } from "../lib/format";
import { useAppState } from "../state";
import type { LibraryItem } from "../lib/library";

/**
 * Search as you type: results follow the letters after a short pause, and
 * Enter or "Найти" searches right away. With no query it shows recent
 * searches and what is popular today, or a catalog by filters.
 */

type Tab = "all" | "movie" | "tv" | "person";

const TABS: Array<[Tab, string]> = [
  ["all", "Всё"],
  ["movie", "Фильмы"],
  ["tv", "Сериалы"],
  ["person", "Люди"],
];
const SORTS: Array<[SearchSort, string]> = [
  ["relevance", "По смыслу"],
  ["popular", "Популярные"],
  ["rating", "Рейтинг"],
  ["year", "Новизна"],
];
const YEARS = Array.from({ length: 60 }, (_, i) =>
  String(new Date().getFullYear() - i),
);
const DELAY = 300;

type Found = {
  /** What was actually searched: the query, or its layout-switched twin. */
  used: string;
  year: string;
  items: TmdbItem[];
  people: PersonHit[];
  page: number;
  pages: number;
};

const STATUS: Record<LibraryItem["status"], string> = {
  watchlist: "Хочу посмотреть",
  watching: "Смотрю",
  watched: "Посмотрено",
  dropped: "Брошено",
};

const fold = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** The title with the typed part lit up. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = fold(query.trim());
  const at = q ? fold(text).indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent text-accent">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  );
}

function TitleRow({
  item,
  query,
  mine,
  onOpen,
}: {
  item: TmdbItem;
  query: string;
  mine?: LibraryItem;
  onOpen: () => void;
}) {
  const media = kindOf(item);
  const title = titleOf(item);
  const original = item.original_title || item.original_name || "";
  const year = yearOf(item.release_date || item.first_air_date);
  const score =
    item.vote_count && item.vote_count >= 20 && item.vote_average
      ? item.vote_average.toFixed(1)
      : "";
  return (
    <Link
      to={`/title/${media}/${item.id}`}
      onClick={onOpen}
      className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5"
    >
      {item.poster_path ? (
        <img
          src={posterUrl(item.poster_path, "w92")}
          alt=""
          loading="lazy"
          className="h-[72px] w-12 shrink-0 rounded-lg border border-hairline object-cover"
        />
      ) : (
        <div className="h-[72px] w-12 shrink-0 rounded-lg border border-hairline bg-card" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-snug">
          <Highlight text={title} query={query} />
        </span>
        {original && original !== title ? (
          <span className="block truncate text-xs text-mute">
            <Highlight text={original} query={query} />
          </span>
        ) : null}
        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
          {[media === "tv" ? "сериал" : "фильм", year, score && `★ ${score}`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {mine ? (
        <span className="shrink-0 rounded-full border border-accent/40 px-2 py-0.5 text-[11px] text-accent">
          {STATUS[mine.status]}
          {mine.rating !== null ? ` · ${mine.rating}` : ""}
        </span>
      ) : null}
    </Link>
  );
}

function PersonRow({ person, query }: { person: PersonHit; query: string }) {
  return (
    <Link
      to={`/person/${person.id}`}
      className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5"
    >
      {person.profile_path ? (
        <img
          src={profileUrl(person.profile_path)}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card text-sm text-mute">
          {person.name.slice(0, 1)}
        </div>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[15px]">
          <Highlight text={person.name} query={query} />
        </span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
          {person.known_for_department === "Directing"
            ? "режиссёр"
            : person.known_for_department === "Acting"
              ? "актёр"
              : person.known_for_department || "человек"}
        </span>
      </span>
    </Link>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "shrink-0 rounded-full border border-ink bg-ink px-2.5 py-1 text-xs text-canvas"
          : "shrink-0 rounded-full border border-hairline px-2.5 py-1 text-xs text-mute"
      }
    >
      {children}
    </button>
  );
}

function FilterGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
        {title}
      </h3>
      {hint ? <p className="mt-0.5 text-[11px] text-dim">{hint}</p> : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {children}
      </div>
    </section>
  );
}

export function SearchPage() {
  const { get, settings } = useAppState();
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.trim() || "";
  const tab = (TABS.find(([id]) => id === params.get("tab"))?.[0] ??
    "all") as Tab;
  const [text, setText] = useState(q);
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const [showFilters, setShowFilters] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [browse, setBrowse] = useState<{
    items: TmdbItem[];
    page: number;
    pages: number;
  } | null>(null);
  const [popular, setPopular] = useState<TmdbItem[]>([]);
  const [recent, setRecent] = useState(recentSearches);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const generation = useRef(0);

  const activeFilters = countFilters(filters);
  const filtered = activeFilters > 0;
  const where = {
    region: settings.region,
    providers: settings.subscribed,
  };
  const status = (item: TmdbItem) => get(kindOf(item), item.id)?.status;

  /** Filters are kept in the address; the tab stays where it is. */
  function setFilters(update: (f: SearchFilters) => SearchFilters) {
    setParams(
      (prev) => filtersToParams(update(filtersFromParams(prev)), prev),
      {
        replace: true,
      },
    );
  }

  const genreName = (id: number) =>
    SEARCH_GENRES.find((g) => g.id === id)?.label ?? String(id);
  const label = <T extends string>(list: Array<[T, string]>, id: T) =>
    list.find(([x]) => x === id)?.[1] ?? id;
  const activeChips: Array<{ key: string; label: string; clear: () => void }> =
    [
      ...(filters.sort !== "relevance"
        ? [
            {
              key: "sort",
              label: `Сортировка: ${label(SORTS, filters.sort).toLowerCase()}`,
              clear: () => setFilters((f) => ({ ...f, sort: "relevance" })),
            },
          ]
        : []),
      ...filters.genres.map((id) => ({
        key: `g${id}`,
        label: genreName(id),
        clear: () =>
          setFilters((f) => ({
            ...f,
            genres: f.genres.filter((g) => g !== id),
          })),
      })),
      ...filters.without.map((id) => ({
        key: `x${id}`,
        label: `без: ${genreName(id)}`,
        clear: () =>
          setFilters((f) => ({
            ...f,
            without: f.without.filter((g) => g !== id),
          })),
      })),
      ...(filters.year || filters.era
        ? [
            {
              key: "era",
              label: filters.year || label(ERAS, filters.era),
              clear: () => setFilters((f) => ({ ...f, era: "", year: "" })),
            },
          ]
        : []),
      ...(filters.minScore
        ? [
            {
              key: "score",
              label: `★ ${String(filters.minScore).replace(".", ",")}+`,
              clear: () => setFilters((f) => ({ ...f, minScore: 0 })),
            },
          ]
        : []),
      ...(filters.fame
        ? [
            {
              key: "fame",
              label: label(FAMES, filters.fame),
              clear: () => setFilters((f) => ({ ...f, fame: "" })),
            },
          ]
        : []),
      ...(filters.mine
        ? [
            {
              key: "mine",
              label: label(MINE, filters.mine),
              clear: () => setFilters((f) => ({ ...f, mine: "" })),
            },
          ]
        : []),
      ...(filters.lang
        ? [
            {
              key: "lang",
              label: label(LANGUAGES, filters.lang),
              clear: () => setFilters((f) => ({ ...f, lang: "" })),
            },
          ]
        : []),
      ...(filters.runtime
        ? [
            {
              key: "len",
              label: label(RUNTIMES, filters.runtime),
              clear: () => setFilters((f) => ({ ...f, runtime: "" })),
            },
          ]
        : []),
      ...(filters.services
        ? [
            {
              key: "svc",
              label: "На моих сервисах",
              clear: () => setFilters((f) => ({ ...f, services: false })),
            },
          ]
        : []),
    ];

  function applyPreset(preset: Partial<SearchFilters>) {
    setParams(
      (prev) => {
        const next = filtersToParams({ ...defaultFilters, ...preset }, prev);
        if (preset.kind && preset.kind !== "all") next.set("tab", preset.kind);
        return next;
      },
      { replace: true },
    );
  }

  /** Genre chips: tap to include, again to exclude, again to clear. */
  function cycleGenre(id: number) {
    setFilters((f) =>
      f.genres.includes(id)
        ? {
            ...f,
            genres: f.genres.filter((g) => g !== id),
            without: [...f.without, id],
          }
        : f.without.includes(id)
          ? { ...f, without: f.without.filter((g) => g !== id) }
          : { ...f, genres: [...f.genres, id] },
    );
  }

  function setParam(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  // The URL can change from outside (back button, a recent search).
  useEffect(() => {
    setText((t) => (t.trim() === q ? t : q));
  }, [q]);

  // Letters typed become the query after a short pause.
  useEffect(() => {
    const next = text.trim();
    if (next === q) return;
    if (next.length === 1) return;
    const timer = window.setTimeout(() => setParam("q", next), DELAY);
    return () => window.clearTimeout(timer);
  }, [text]);

  // Search by the query; a wrong keyboard layout is tried as a fallback.
  useEffect(() => {
    const run = ++generation.current;
    if (!q) {
      setFound(null);
      return;
    }
    const { text: core, year } = splitYear(q);
    setLoading(true);
    setError(null);
    const ask = (s: string) =>
      Promise.all([tmdb.searchCatalog(s, 1), catalog.people(s, 1)]);
    (async () => {
      let used = core;
      let [data, persons] = await ask(core);
      const alt = switchLayout(core);
      if (!data.results.length && !persons.results.length && alt) {
        const [d2, p2] = await ask(alt);
        if (d2.results.length || p2.results.length) {
          [data, persons] = [d2, p2];
          used = alt;
        }
      }
      if (run !== generation.current) return;
      setFound({
        used,
        year,
        items: data.results,
        people: persons.results,
        page: 1,
        pages: data.total_pages,
      });
    })()
      .catch((e: Error) => run === generation.current && setError(e.message))
      .finally(() => run === generation.current && setLoading(false));
  }, [q]);

  // With no query but some filters: the catalog by those filters.
  const browseKey = JSON.stringify({ ...filters, tab });
  useEffect(() => {
    if (q || !filtered) {
      setBrowse(null);
      return;
    }
    let alive = true;
    setLoading(true);
    catalog
      .browseFiltered(filters, 1, where)
      .then(
        (d) =>
          alive &&
          setBrowse({ items: d.results, page: d.page, pages: d.total_pages }),
      )
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q, browseKey]);

  // Popular today, for the empty page.
  useEffect(() => {
    if (q || popular.length) return;
    tmdb
      .trending("day")
      .then((d) =>
        setPopular(d.results.filter((x) => x.media_type !== "person")),
      )
      .catch(() => undefined);
  }, [q]);

  const kind = tab === "movie" || tab === "tv" ? tab : "all";
  const titles = useMemo(
    () =>
      found
        ? applySearch(
            found.items,
            found.used,
            { ...filters, kind, year: found.year || filters.year },
            status,
          )
        : [],
    [found, filters, kind, get],
  );

  async function loadMore() {
    if (loading) return;
    const run = generation.current;
    if (found && found.page < found.pages) {
      setLoading(true);
      try {
        const data = await tmdb.searchCatalog(found.used, found.page + 1);
        if (run !== generation.current) return;
        setFound((f) =>
          f
            ? {
                ...f,
                items: [
                  ...f.items,
                  ...data.results.filter(
                    (x) =>
                      !f.items.some(
                        (y) => y.id === x.id && y.media_type === x.media_type,
                      ),
                  ),
                ],
                page: data.page,
                pages: data.total_pages,
              }
            : f,
        );
      } catch (e) {
        if (run === generation.current) setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    } else if (!q && browse && browse.page < browse.pages) {
      setLoading(true);
      try {
        const data = await catalog.browseFiltered(
          filters,
          browse.page + 1,
          where,
        );
        setBrowse((b) =>
          b
            ? {
                items: [...b.items, ...data.results],
                page: data.page,
                pages: data.total_pages,
              }
            : b,
        );
      } finally {
        setLoading(false);
      }
    }
  }

  // Next pages load as the end of the list comes into view.
  const canMore = found
    ? found.page < found.pages && tab !== "person"
    : Boolean(browse && browse.page < browse.pages);
  useEffect(() => {
    if (!canMore || !more.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(more.current);
    return () => observer.disconnect();
  });

  function submit(value = text) {
    const next = value.trim();
    setText(next);
    setParam("q", next);
    if (next) setRecent(rememberSearch(next));
    input.current?.blur();
  }

  function clear() {
    setText("");
    setParam("q", "");
    input.current?.focus();
  }

  const remember = () => q && setRecent(rememberSearch(q));
  const typing = text.trim() !== q && text.trim().length > 1;

  const list = q
    ? titles
    : applySearch(browse?.items ?? [], "", filters, status);
  const people = found?.people ?? [];

  return (
    <div className="rise">
      <form
        role="search"
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-hairline bg-card px-3 focus-within:border-accent/70">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0 text-dim"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") clear();
            }}
            autoFocus={!q}
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Поиск фильмов, сериалов и людей"
            placeholder="Фильм, сериал, актёр…"
            className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-dim"
          />
          {loading || typing ? (
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-accent"
            />
          ) : null}
          {text ? (
            <button
              type="button"
              onClick={clear}
              aria-label="Очистить"
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-mute hover:bg-white/10"
            >
              ×
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-black"
        >
          Найти
        </button>
      </form>

      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
        {TABS.map(([id, label]) => (
          <Chip
            key={id}
            active={tab === id}
            onClick={() => setParam("tab", id === "all" ? "" : id)}
          >
            {label}
          </Chip>
        ))}
        {tab !== "person" ? (
          <button
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
            className={`ml-auto shrink-0 rounded-full border px-2.5 py-1 text-xs ${activeFilters ? "border-accent text-accent" : "border-hairline text-mute"}`}
          >
            Фильтры{activeFilters ? ` · ${activeFilters}` : ""}
          </button>
        ) : null}
      </div>

      {activeFilters && tab !== "person" ? (
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          aria-label="Включённые фильтры"
        >
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              aria-label={`Убрать фильтр: ${c.label}`}
              className="rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent"
            >
              {c.label} ×
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setFilters((f) => ({ ...defaultFilters, kind: f.kind }))
            }
            className="px-1 text-xs text-mute underline"
          >
            Сбросить всё
          </button>
        </div>
      ) : null}

      {showFilters && tab !== "person" ? (
        <div className="mt-2 space-y-4 rounded-2xl border border-hairline bg-card p-3">
          <FilterGroup title="Готовые подборки">
            {PRESETS.filter(
              (p) => !(q && (p.filters.services || p.filters.runtime)),
            ).map((p) => (
              <Chip
                key={p.id}
                active={false}
                onClick={() => applyPreset(p.filters)}
              >
                {p.label}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Сортировка">
            {SORTS.map(([id, label]) => (
              <Chip
                key={id}
                active={filters.sort === id}
                onClick={() => setFilters((f) => ({ ...f, sort: id }))}
              >
                {label}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Жанры" hint="Нажми ещё раз, чтобы исключить жанр">
            {SEARCH_GENRES.map((g) => {
              const on = filters.genres.includes(g.id);
              const off = filters.without.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on || off}
                  aria-label={off ? `${g.label}: исключён` : g.label}
                  onClick={() => cycleGenre(g.id)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${on ? "border-ink bg-ink text-canvas" : off ? "border-accent/60 text-accent line-through" : "border-hairline text-mute"}`}
                >
                  {off ? "без: " : ""}
                  {g.label}
                </button>
              );
            })}
          </FilterGroup>
          <FilterGroup title="Годы">
            {ERAS.map(([id, label]) => (
              <Chip
                key={id}
                active={!filters.year && filters.era === id}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    year: "",
                    era: f.era === id && !f.year ? "" : id,
                  }))
                }
              >
                {label}
              </Chip>
            ))}
            <select
              value={filters.year}
              onChange={(e) =>
                setFilters((f) => ({ ...f, year: e.target.value }))
              }
              aria-label="Точный год"
              className={`rounded-full border bg-canvas px-2.5 py-1 text-xs ${filters.year ? "border-ink text-ink" : "border-hairline text-mute"}`}
            >
              <option value="">Точный год</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </FilterGroup>
          <FilterGroup title="Рейтинг TMDB">
            {SCORE_STEPS.map((n) => (
              <Chip
                key={n}
                active={filters.minScore === n}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    minScore: f.minScore === n ? 0 : n,
                  }))
                }
              >
                ★ {String(n).replace(".", ",")}+
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Известность">
            {FAMES.map(([id, label]) => (
              <Chip
                key={id}
                active={filters.fame === id}
                onClick={() =>
                  setFilters((f) => ({ ...f, fame: f.fame === id ? "" : id }))
                }
              >
                {label}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Моя коллекция">
            {MINE.map(([id, label]) => (
              <Chip
                key={id}
                active={filters.mine === id}
                onClick={() =>
                  setFilters((f) => ({ ...f, mine: f.mine === id ? "" : id }))
                }
              >
                {label}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Язык оригинала">
            {LANGUAGES.map(([id, label]) => (
              <Chip
                key={id}
                active={filters.lang === id}
                onClick={() =>
                  setFilters((f) => ({ ...f, lang: f.lang === id ? "" : id }))
                }
              >
                {label}
              </Chip>
            ))}
          </FilterGroup>
          {q ? (
            <p className="text-xs text-dim">
              Длительность и «На моих сервисах» работают в каталоге — очисти
              поиск, чтобы подобрать по ним.
            </p>
          ) : (
            <>
              <FilterGroup title="Длительность">
                {RUNTIMES.map(([id, label]) => (
                  <Chip
                    key={id}
                    active={filters.runtime === id}
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        runtime: f.runtime === id ? "" : id,
                      }))
                    }
                  >
                    {label}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup title="Где смотреть">
                <Chip
                  active={filters.services}
                  onClick={() =>
                    setFilters((f) => ({ ...f, services: !f.services }))
                  }
                >
                  На моих сервисах
                </Chip>
              </FilterGroup>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowFilters(false)}
            className="w-full rounded-full bg-accent py-2 text-sm font-medium text-black"
          >
            Показать результаты
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorBox code={error} />
        </div>
      ) : null}

      {found && found.used !== splitYear(q).text ? (
        <p className="mt-4 text-sm text-mute">
          Показаны результаты для «
          <button
            type="button"
            onClick={() => submit(found.used)}
            className="text-accent"
          >
            {found.used}
          </button>
          » — похоже, была не та раскладка.
        </p>
      ) : null}

      {q && found ? (
        <div className="mt-4">
          {tab === "all" && people.length ? (
            <section aria-label="Люди" className="mb-3">
              <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
                {people.slice(0, 10).map((p) => (
                  <Link
                    key={p.id}
                    to={`/person/${p.id}`}
                    onClick={remember}
                    className="w-[72px] shrink-0 text-center"
                  >
                    {p.profile_path ? (
                      <img
                        src={profileUrl(p.profile_path)}
                        alt=""
                        loading="lazy"
                        className="mx-auto h-16 w-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-card text-sm text-mute">
                        {p.name.slice(0, 1)}
                      </div>
                    )}
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-tight">
                      {p.name}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          {tab === "person" ? (
            people.length ? (
              <div className="divide-y divide-hairline/50">
                {people.map((p) => (
                  <PersonRow key={p.id} person={p} query={found.used} />
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm text-mute">Никого не нашлось.</p>
            )
          ) : list.length ? (
            <div>
              {list.map((item) => (
                <TitleRow
                  key={`${kindOf(item)}-${item.id}`}
                  item={item}
                  query={found.used}
                  mine={get(kindOf(item), item.id)}
                  onOpen={remember}
                />
              ))}
            </div>
          ) : !loading ? (
            <p className="mt-6 text-sm text-mute">
              {activeFilters || found.year
                ? "С такими фильтрами ничего нет — попробуй их сбросить."
                : "Ничего не нашлось. Проверь написание или попробуй оригинальное название."}
            </p>
          ) : null}
        </div>
      ) : null}

      {!q && browse ? (
        <div className="mt-4">
          {!list.length && !loading ? (
            <p className="mt-2 text-sm text-mute">
              По этим фильтрам ничего нет — попробуй убрать какой-нибудь.
            </p>
          ) : null}
          {list.map((item) => (
            <TitleRow
              key={`${kindOf(item)}-${item.id}`}
              item={item}
              query=""
              mine={get(kindOf(item), item.id)}
              onOpen={() => undefined}
            />
          ))}
        </div>
      ) : null}

      {canMore ? (
        <div ref={more} className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadMore()}
            className="rounded-full border border-hairline px-4 py-2 text-sm disabled:opacity-50"
          >
            {loading ? "Загрузка…" : "Ещё результаты"}
          </button>
        </div>
      ) : null}

      {!q && !filtered ? (
        <div className="mt-6 space-y-6">
          {recent.length ? (
            <section>
              <div className="flex items-center justify-between">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">
                  недавно искал
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    forgetSearches();
                    setRecent([]);
                  }}
                  className="text-xs text-mute"
                >
                  Очистить
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => submit(r)}
                    className="rounded-full border border-hairline bg-card px-3 py-1.5 text-sm"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {popular.length ? (
            <section>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">
                сейчас ищут
              </h2>
              <div className="mt-1">
                {popular.slice(0, 10).map((item) => (
                  <TitleRow
                    key={`${kindOf(item)}-${item.id}`}
                    item={item}
                    query=""
                    mine={get(kindOf(item), item.id)}
                    onOpen={() => undefined}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
