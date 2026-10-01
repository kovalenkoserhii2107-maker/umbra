import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { Empty, useAsync } from "../components";
import { CARD } from "../components/TitleDetails";
import {
  GameError,
  GameGrid,
  GameTile,
  PlatformPicker,
} from "../components/GameTile";
import { useGameLibrary } from "../lib/gameLibrary";
import { migrateGameLibrary } from "../lib/gameMigration";
import {
  BestShelf,
  DealsShelf,
  FeedShelves,
  GamePassShelves,
  Giveaways,
} from "../components/GameFeed";
import {
  GENRE_FILTERS,
  PLATFORM_GROUPS,
  companyGames,
  companyIdByName,
  idByTitle,
  imageUrl,
  platformGroup,
  platformIds,
  searchGames,
  type GameSummary,
  type PlatformGroupId,
  type SearchSort,
} from "../lib/igdb";
import { toggleMyPlatform, useMyPlatforms } from "../lib/myPlatforms";

const YEARS = Array.from(
  { length: 30 },
  (_, i) => new Date().getFullYear() + 1 - i,
);
const CRITICS = [0, 70, 80, 90];

function chip(active: boolean) {
  return active
    ? "shrink-0 rounded-full border border-ink bg-ink px-3 py-1 text-xs text-canvas"
    : "shrink-0 rounded-full border border-hairline px-3 py-1 text-xs text-mute";
}

/** Waits for the user to stop typing before asking IGDB. */
function useDebounced<T>(value: T, ms: number) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return current;
}

export function GameSearchPage() {
  const mine = useMyPlatforms();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const text = useDebounced(query.trim(), 350);
  const [groups, setGroups] = useState<PlatformGroupId[]>(mine);
  const [genre, setGenre] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [minCritics, setMinCritics] = useState(0);
  const [sort, setSort] = useState<SearchSort>("relevance");
  const [pages, setPages] = useState<GameSummary[][]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<{ loading: boolean; error: string }>({
    loading: true,
    error: "",
  });
  const filters = {
    platforms: platformIds(groups),
    genre,
    year,
    minCritics,
    sort: text ? sort : sort === "relevance" ? "popular" : sort,
  } as const;
  const key = JSON.stringify([text, filters]);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: "" });
    setPages([]);
    searchGames(text, { ...filters }, 0)
      .then((r) => {
        if (!alive) return;
        setPages([r.list]);
        setMore(r.more);
        setState({ loading: false, error: "" });
      })
      .catch(
        (e: Error) => alive && setState({ loading: false, error: e.message }),
      );
    return () => {
      alive = false;
    };
  }, [key]);

  function loadMore() {
    const offset = pages.reduce((n, p) => n + p.length, 0);
    setState({ loading: true, error: "" });
    searchGames(text, { ...filters }, offset)
      .then((r) => {
        setPages((p) => [...p, r.list]);
        setMore(r.more);
        setState({ loading: false, error: "" });
      })
      .catch((e: Error) => setState({ loading: false, error: e.message }));
  }

  const seen = new Set<number>();
  const shown = pages
    .flat()
    .filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        поиск
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Поиск игр</h1>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Название игры"
        aria-label="Название игры"
        className="mt-6 w-full rounded-full border border-hairline bg-card px-4 py-3 text-sm outline-none placeholder:text-dim focus:border-accent/60"
      />
      <div className="mt-5 space-y-3">
        <PlatformPicker
          label="Платформы"
          value={groups}
          onToggle={(id) =>
            setGroups((current) =>
              current.includes(id)
                ? current.filter((g) => g !== id)
                : [...current, id],
            )
          }
        />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["relevance", text ? "По смыслу" : "Популярные"],
              ...(text ? [["popular", "Популярные"]] : []),
              ["rating", "Оценка критиков"],
              ["new", "Новые"],
            ] as Array<[SearchSort, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              className={chip(sort === id)}
              onClick={() => setSort(id)}
            >
              {label}
            </button>
          ))}
          {CRITICS.map((score) => (
            <button
              key={score}
              className={chip(minCritics === score)}
              onClick={() => setMinCritics(score)}
            >
              {score ? `Критики ${score}+` : "Любая оценка"}
            </button>
          ))}
        </div>
        <div className="row-scroll flex gap-2 overflow-x-auto pb-1">
          <button className={chip(!genre)} onClick={() => setGenre(null)}>
            Все жанры
          </button>
          {GENRE_FILTERS.map((g) => (
            <button
              key={g.id}
              className={chip(genre === g.id)}
              onClick={() => setGenre(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="row-scroll flex gap-2 overflow-x-auto pb-1">
          <button className={chip(!year)} onClick={() => setYear(null)}>
            Любой год
          </button>
          {YEARS.map((y) => (
            <button
              key={y}
              className={chip(year === y)}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6">
        {state.error && !shown.length ? <GameError code={state.error} /> : null}
        {shown.length ? (
          <>
            <GameGrid games={shown} />
            {more ? (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={state.loading}
                  className="rounded-full border border-hairline px-4 py-2 text-sm disabled:opacity-50"
                >
                  {state.loading ? "Загружаю…" : "Ещё результаты"}
                </button>
              </div>
            ) : null}
          </>
        ) : state.loading ? (
          <p role="status" className="text-sm text-mute">
            Ищу…
          </p>
        ) : !state.error ? (
          <Empty text="Ничего не нашлось. Измени запрос или сними часть фильтров." />
        ) : null}
      </div>
    </div>
  );
}

export function GamePlatformsPage() {
  const mine = useMyPlatforms();
  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        платформы
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Где играть</h1>
      <p className="mt-2 text-sm text-mute">
        Отметь свои платформы: лента и поиск будут начинаться с них.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {PLATFORM_GROUPS.map((p) => {
          const on = mine.includes(p.id);
          return (
            <div key={p.id} className={`${CARD} p-5`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-[0.16em] text-dim">
                  {p.full}
                </span>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: p.tint }}
                />
              </div>
              <Link
                to={`/games/platforms/${p.id}`}
                className="mt-6 block text-2xl tracking-tight hover:text-accent"
              >
                {p.name} →
              </Link>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggleMyPlatform(p.id)}
                className={`mt-4 rounded-full border px-3 py-1 text-xs ${on ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`}
              >
                {on ? "✓ Моя платформа" : "Добавить в мои"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GamePlatformPage() {
  const { id = "" } = useParams();
  const platform = platformGroup(id);
  if (!platform)
    return <p className="text-sm text-mute">Платформа не найдена.</p>;
  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        {platform.full}
      </p>
      <h1 className="mb-8 mt-1 text-3xl tracking-tight">{platform.name}</h1>
      <FeedShelves platforms={[...platform.ids]} />
      <Giveaways groups={[platform.id]} />
      {platform.id === "pc" ? <DealsShelf /> : null}
      {platform.id === "pc" || platform.id === "xbox" ? (
        <GamePassShelves />
      ) : null}
      <BestShelf platforms={[...platform.ids]} />
    </div>
  );
}

export function StudioPage() {
  const { name = "" } = useParams();
  const numeric = /^\d+$/.test(name);
  // Old links carried the studio name; they are looked up once.
  const byName = useAsync(
    () => (numeric ? Promise.resolve(null) : companyIdByName(name)),
    [name],
  );
  const studio = useAsync(
    () => (numeric ? companyGames(Number(name)) : Promise.resolve(null)),
    [name],
  );
  if (!numeric) {
    if (byName.data)
      return <Navigate replace to={`/games/studio/${byName.data}`} />;
    if (byName.loading)
      return (
        <p role="status" className="text-sm text-mute">
          Ищу студию…
        </p>
      );
    return <GameError code={byName.error || "HTTP_404"} />;
  }
  if (studio.error) return <GameError code={studio.error} />;
  const data = studio.data;
  if (!data)
    return (
      <p role="status" className="text-sm text-mute">
        Собираю игры студии…
      </p>
    );
  const groups: Array<{ label: string; games: GameSummary[] }> = [];
  for (const game of data.games) {
    const label = game.year
      ? game.released! * 1000 > Date.now()
        ? "Скоро"
        : String(game.year)
      : "Без даты";
    const last = groups.at(-1);
    if (last?.label === label) last.games.push(game);
    else groups.push({ label, games: [game] });
  }
  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        студия
      </p>
      <div className="mt-1 flex items-center gap-4">
        {data.logo ? (
          <img
            src={imageUrl(data.logo, "logo_med")}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl bg-white/90 object-contain p-1"
          />
        ) : null}
        <h1 className="text-3xl tracking-tight">{data.name}</h1>
      </div>
      <p className="mt-2 text-sm text-mute">
        {[
          data.founded ? `основана в ${data.founded}` : "",
          data.games.length ? `${data.games.length} игр` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {data.description ? (
        <p
          lang="en"
          className="mt-4 line-clamp-6 max-w-3xl text-sm leading-6 text-mute"
        >
          {data.description}
        </p>
      ) : null}
      {data.website ? (
        <a
          href={data.website}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-accent"
        >
          Сайт студии ↗
        </a>
      ) : null}
      {!data.games.length ? (
        <Empty text="У студии пока нет игр в IGDB." />
      ) : null}
      {groups.map((group) => (
        <section key={group.label} className="mt-8">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-dim">
            {group.label}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {group.games.map((game) => (
              <GameTile
                key={game.id}
                game={game}
                layout="grid"
                note={data.developed.has(game.id) ? undefined : "издатель"}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function GameLibraryPage() {
  const items = useGameLibrary();
  const [filter, setFilter] = useState<"all" | "played" | "want">("all");
  useEffect(() => {
    migrateGameLibrary();
  }, []);
  const list = items.filter((item) =>
    filter === "all" ? true : item.status === filter,
  );
  const played = items.filter((item) => item.status === "played").length;

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        коллекция
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Игры</h1>
      <p className="mt-2 text-sm text-mute">
        {played} пройдено · {items.length - played} в «Хочу поиграть»
      </p>
      <div className="mb-6 mt-6 flex flex-wrap gap-2">
        {(
          [
            ["all", "Все"],
            ["played", "Пройденные"],
            ["want", "Хочу поиграть"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
              filter === id
                ? "border-ink bg-ink text-canvas"
                : "border-hairline text-mute"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty text="Пока пусто. Открой игру и добавь её в пройденные или в «Хочу поиграть»." />
      ) : (
        <div className="space-y-2">
          {list.map((item) => (
            <Link
              key={`${item.source ?? "old"}-${item.id}`}
              to={
                item.source === "igdb"
                  ? `/games/${item.id}`
                  : `/games/search?q=${encodeURIComponent(item.title)}`
              }
              className="flex gap-3 rounded-xl border border-hairline bg-card p-2 hover:border-accent/40"
            >
              {item.thumbnail ? (
                <img
                  src={item.thumbnail}
                  alt=""
                  loading="lazy"
                  className="h-20 w-15 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-20 w-15 shrink-0 rounded-lg bg-canvas-soft" />
              )}
              <div className="min-w-0 py-1">
                <p className="truncate">{item.title}</p>
                <p className="font-mono text-[11px] uppercase tracking-wider text-dim">
                  {item.genre}
                  {item.year ? ` · ${item.year}` : ""}
                  {item.status === "want"
                    ? " · хочу поиграть"
                    : item.rating
                      ? ` · ${item.rating}/10`
                      : " · пройдено"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Opens a game known only by title (e.g. from a store deal). */
export function GameFindPage() {
  const [params] = useSearchParams();
  const title = params.get("title") || "";
  const found = useAsync(() => idByTitle(title), [title]);
  if (found.loading)
    return (
      <p role="status" className="text-sm text-mute">
        Ищу «{title}»…
      </p>
    );
  if (found.data) return <Navigate replace to={`/games/${found.data}`} />;
  return (
    <Navigate replace to={`/games/search?q=${encodeURIComponent(title)}`} />
  );
}
