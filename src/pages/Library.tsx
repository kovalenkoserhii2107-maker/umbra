import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Empty } from "../components";
import { correctPosterUrl } from "../lib/tmdb";
import { useAppState, type LibraryItem, type Status } from "../state";
import {
  DECADES,
  DEFAULT_FILTERS,
  RATING_BANDS,
  SORTS,
  filterCollection,
  filtersFromParams,
  genresOf,
  paramsFromFilters,
  type CollectionFilters,
} from "../lib/collection";
import { useLibraryMeta } from "../lib/meta";
import { episodeLabel, progressOf } from "../lib/tracking";
import { sharedStatus, useFriendsOn } from "../components/FriendsIndex";
import type { MediaType } from "../lib/tmdb";

function FriendsLine({ type, id }: { type: MediaType; id: number }) {
  const rows = useFriendsOn(type, id);
  if (!rows.length) return null;
  return (
    <p className="mt-0.5 truncate font-mono text-[11px] text-accent">
      {rows
        .slice(0, 3)
        .map(({ friend, rating }) => `${friend.name} ${sharedStatus(rating)}`)
        .join(" · ")}
      {rows.length > 3 ? ` · +${rows.length - 3}` : ""}
    </p>
  );
}

const STATUSES: Array<{ id: "all" | Status; label: string }> = [
  { id: "all", label: "Всі" },
  { id: "watching", label: "Дивлюся" },
  { id: "watched", label: "Переглянуто" },
  { id: "watchlist", label: "Хочу подивитися" },
  { id: "dropped", label: "Покинуто" },
];

function statusLine(item: LibraryItem) {
  const progress = progressOf(item);
  if (item.status === "watchlist") return "хочу подивитися";
  if (item.status === "watching")
    return progress ? `дивлюся · ${episodeLabel(progress)}` : "дивлюся";
  if (item.status === "dropped")
    return progress ? `покинуто на ${episodeLabel(progress)}` : "покинуто";
  return item.rating ? `${item.rating}/10` : "переглянуто";
}

export function LibraryPage() {
  const { items } = useAppState();
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const { meta, loading } = useLibraryMeta(items);
  const genres = useMemo(() => genresOf(items, meta), [items, meta]);
  const list = useMemo(
    () => filterCollection(items, filters, meta),
    [items, meta, params.toString()],
  );
  function set(patch: Partial<CollectionFilters>) {
    setParams(paramsFromFilters({ ...filters, ...patch }), { replace: true });
  }
  const counts = (status: "all" | Status) =>
    status === "all"
      ? items.length
      : items.filter((x) => x.status === status).length;
  const narrowed =
    paramsFromFilters({ ...filters, sort: DEFAULT_FILTERS.sort }).toString() !==
    "";
  const select =
    "h-9 min-w-0 rounded-full border border-hairline bg-card px-3 text-xs text-ink outline-none focus:border-accent";

  return (
    <div className="rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
            колекція
          </p>
          <h1 className="mt-1 text-3xl tracking-tight">Фільмографія</h1>
        </div>
        <div className="flex gap-2">
          <Link
            to="/stats"
            className="rounded-full border border-hairline px-3 py-1.5 text-xs text-mute hover:text-ink"
          >
            Статистика
          </Link>
          <Link
            to="/friends"
            className="rounded-full border border-hairline px-3 py-1.5 text-xs text-mute hover:text-ink"
          >
            Друзі
          </Link>
        </div>
      </div>

      <input
        type="search"
        value={filters.q}
        onChange={(e) => set({ q: e.target.value })}
        placeholder="Знайти в колекції"
        aria-label="Знайти в колекції"
        className="mt-5 h-11 w-full rounded-2xl border border-hairline bg-card px-4 text-sm outline-none focus:border-accent"
      />

      <div className="row-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
        {STATUSES.filter((s) => s.id === "all" || counts(s.id) > 0).map((s) => (
          <button
            key={s.id}
            onClick={() => set({ status: s.id })}
            className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${
              filters.status === s.id
                ? "border-ink bg-ink text-canvas"
                : "border-hairline text-mute"
            }`}
          >
            {s.label} · {counts(s.id)}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <select
          aria-label="Тип"
          value={filters.type}
          onChange={(e) =>
            set({ type: e.target.value as CollectionFilters["type"] })
          }
          className={select}
        >
          <option value="all">Фільми та серіали</option>
          <option value="movie">Фільми</option>
          <option value="tv">Серіали</option>
        </select>
        <select
          aria-label="Жанр"
          value={filters.genre}
          onChange={(e) => set({ genre: e.target.value })}
          className={select}
        >
          <option value="">
            {loading && !genres.length ? "Жанри…" : "Всі жанри"}
          </option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          aria-label="Оцінка"
          value={filters.rating}
          onChange={(e) =>
            set({ rating: e.target.value as CollectionFilters["rating"] })
          }
          className={select}
        >
          {RATING_BANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Роки виходу"
          value={filters.decade}
          onChange={(e) =>
            set({ decade: e.target.value as CollectionFilters["decade"] })
          }
          className={select}
        >
          {DECADES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Сортування"
          value={filters.sort}
          onChange={(e) =>
            set({ sort: e.target.value as CollectionFilters["sort"] })
          }
          className={`${select} col-span-2 sm:col-span-1`}
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 mb-4 flex items-center justify-between gap-3 text-xs text-mute">
        <span>
          {narrowed
            ? `Знайдено ${list.length} з ${items.length}`
            : `Усього ${items.length}`}
        </span>
        {narrowed ? (
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="text-accent"
          >
            Скинути фільтри
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <Empty text="Поки порожньо. Відкрий фільм і додай його в переглянуті або в «Хочу подивитися»." />
      ) : list.length === 0 ? (
        <Empty text="Під ці фільтри нічого не підходить." />
      ) : (
        <div className="space-y-2">
          {list.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              to={`/title/${item.type}/${item.id}`}
              className="flex gap-3 rounded-xl border border-hairline bg-card p-2 hover:border-accent/40"
            >
              {item.poster ? (
                <img
                  src={correctPosterUrl(item.poster)}
                  alt=""
                  className="h-20 w-14 rounded-lg object-cover"
                />
              ) : (
                <div className="h-20 w-14 rounded-lg bg-canvas-soft" />
              )}
              <div className="min-w-0 flex-1 py-1">
                <p className="truncate">{item.title}</p>
                <p className="font-mono text-[11px] uppercase tracking-wider text-dim">
                  {item.type === "tv" ? "серіал" : "фільм"}
                  {item.year ? ` · ${item.year}` : ""} · {statusLine(item)}
                </p>
                <FriendsLine type={item.type} id={item.id} />
                {item.note && item.status !== "watchlist" ? (
                  <p className="mt-1 line-clamp-1 text-sm text-mute">
                    {item.note}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
