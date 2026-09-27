import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Empty, ErrorBox, useAsync } from "../components";
import { GameCard, GameRow } from "../components/GameCard";
import { useGameLibrary } from "../lib/gameLibrary";
import {
  GAME_PLATFORMS,
  gamePlatform,
  matchGames,
  platformGiveaways,
} from "../lib/games";
import { catalogGames, loadSteamCatalog } from "../lib/steamCatalog";
import { consoleGames, loadConsoleCatalog } from "../lib/consoleCatalog";
import { studioInfo, type StudioInfo } from "../lib/studioInfo";

export function GameSearchPage() {
  const [query, setQuery] = useState("");
  const catalog = useAsync(() => loadSteamCatalog(), []);
  const pool = useMemo(
    () => Object.values(catalog.data?.games ?? {}),
    [catalog.data],
  );
  const shown = useMemo(() => {
    if (!catalog.data) return [];
    if (!query.trim()) return catalogGames(catalog.data, catalog.data.popular);
    return matchGames(pool, query).slice(0, 40);
  }, [catalog.data, pool, query]);

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        поиск
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Поиск игр</h1>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Название, жанр, студия"
        className="mt-6 w-full rounded-full border border-hairline bg-card px-4 py-2 text-sm outline-none placeholder:text-dim focus:border-accent/60"
      />
      {catalog.error && !catalog.data ? (
        <div className="mt-6">
          <ErrorBox code={catalog.error} />
        </div>
      ) : null}
      {query.trim() && !shown.length && catalog.data ? (
        <Empty text="Ничего не нашлось." />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((game) => (
            <GameCard key={game.id} game={game} layout="grid" />
          ))}
        </div>
      )}
    </div>
  );
}

export function GamePlatformsPage() {
  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        платформы
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Где играть</h1>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {GAME_PLATFORMS.map((platform) => (
          <Link
            key={platform.id}
            to={`/games/platforms/${platform.id}`}
            className="rounded-2xl border border-hairline bg-card p-5 transition hover:border-accent/40"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[0.16em] text-dim">
                {platform.short}
              </span>
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: platform.tint }}
              />
            </div>
            <h2 className="mt-6 text-2xl tracking-tight">{platform.name}</h2>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function GamePlatformPage() {
  const { id = "" } = useParams();
  const platform = gamePlatform(id);
  const catalog = useAsync(
    () => (id === "pc" ? loadSteamCatalog() : Promise.resolve(null)),
    [id],
  );
  const consoles = useAsync(
    () =>
      id === "playstation" || id === "xbox"
        ? loadConsoleCatalog()
        : Promise.resolve(null),
    [id],
  );
  const drops = useAsync(
    () =>
      platform
        ? platformGiveaways(
            id === "pc"
              ? ["steam", "pc"]
              : id === "playstation"
                ? ["ps4", "ps5"]
                : ["xbox-one", "xbox-series-xs"],
          )
        : Promise.resolve([]),
    [id, platform?.id],
  );

  if (!platform)
    return <p className="text-sm text-mute">Платформа не найдена.</p>;

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        {platform.short}
      </p>
      <h1 className="mt-1 mb-8 text-3xl tracking-tight">{platform.name}</h1>
      {id === "pc" && catalog.data ? (
        <>
          <GameRow
            title="Самое популярное"
            items={catalogGames(catalog.data, catalog.data.popular)}
          />
          <GameRow
            title="Скоро выходит"
            items={catalogGames(catalog.data, catalog.data.upcoming)}
          />
          <GameRow title="Топ 100" items={catalogGames(catalog.data, catalog.data.top)} />
        </>
      ) : null}
      {consoles.data && (id === "playstation" || id === "xbox") ? (
        <>
          <GameRow
            title="Самое популярное"
            items={consoleGames(consoles.data, consoles.data[id].popular)}
          />
          <GameRow
            title="Скоро выходит"
            items={consoleGames(consoles.data, consoles.data[id].upcoming)}
          />
          <GameRow
            title="Топ 100"
            items={consoleGames(consoles.data, consoles.data[id].top)}
          />
        </>
      ) : null}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium tracking-tight">Сейчас раздают</h2>
        {drops.data?.length ? (
          <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
            {drops.data.map((item) => (
              <a
                key={item.id}
                href={item.open_giveaway_url}
                target="_blank"
                rel="noreferrer"
                className="block w-[68vw] shrink-0 sm:w-72"
              >
                <div className="overflow-hidden rounded-xl border border-hairline bg-card">
                  <img
                    src={item.thumbnail || item.image}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                </div>
                <p className="mt-2 line-clamp-2 text-sm">{item.title}</p>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
                  раздача
                </p>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-mute">Сейчас раздач нет.</p>
        )}
      </section>
    </div>
  );
}

export function StudioPage() {
  const { name = "" } = useParams();
  const studio = decodeURIComponent(name);
  const catalog = useAsync(() => loadSteamCatalog(), []);
  const games = catalog.data
    ? catalogGames(
        catalog.data,
        catalog.data.studios?.[studio] ||
          Object.values(catalog.data.games)
            .filter((game) => game.developer === studio)
            .sort((a, b) => Number(b.release_date || 0) - Number(a.release_date || 0))
            .map((game) => game.id),
      )
    : [];
  const [about, setAbout] = useState<StudioInfo | null>(null);
  useEffect(() => {
    let alive = true;
    setAbout(null);
    studioInfo(studio).then((info) => {
      if (alive) setAbout(info);
    });
    return () => {
      alive = false;
    };
  }, [studio]);
  const groups: { year: string; items: typeof games }[] = [];
  let seenYear = false;
  for (const game of games) {
    const year = game.release_date || (seenYear ? "Без даты" : "Скоро");
    if (game.release_date) seenYear = true;
    const last = groups.at(-1);
    if (!last || last.year !== year) groups.push({ year, items: [game] });
    else last.items.push(game);
  }

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        студия
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">{studio}</h1>
      <p className="mt-2 text-sm text-mute">
        {games.length ? `${games.length} игр, от новых к ранним` : "Собираю список…"}
      </p>
      {about ? (
        <div className="mt-5 flex gap-4 rounded-2xl border border-hairline bg-card p-4">
          {about.image ? (
            <img
              src={about.image}
              alt=""
              className="h-16 w-16 shrink-0 rounded-xl bg-canvas object-contain"
            />
          ) : null}
          <div className="min-w-0">
            {about.description ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                {about.description}
              </p>
            ) : null}
            <p className="mt-2 text-sm leading-relaxed text-mute">{about.extract}</p>
            {about.url ? (
              <a
                href={about.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-dim"
              >
                Подробнее
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
      {catalog.error && !catalog.data ? <ErrorBox code={catalog.error} /> : null}
      {!catalog.loading && !games.length ? (
        <Empty text="У этой студии пока нет игр в каталоге." />
      ) : null}
      {groups.map((group) => (
        <section key={group.year} className="mt-8">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-dim">
            {group.year}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {group.items.map((game) => (
              <GameCard key={game.id} game={game} layout="grid" />
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
      <div className="mt-6 mb-6 flex flex-wrap gap-2">
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
              key={item.id}
              to={`/games/${item.id}`}
              className="flex gap-3 rounded-xl border border-hairline bg-card p-2 hover:border-accent/40"
            >
              {item.thumbnail ? (
                <img
                  src={item.thumbnail}
                  alt=""
                  className="h-16 w-28 rounded-lg object-cover"
                />
              ) : (
                <div className="h-16 w-28 rounded-lg bg-canvas-soft" />
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
