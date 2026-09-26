import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Empty } from "../components";
import { correctPosterUrl } from "../lib/tmdb";
import { useAppState, type Status } from "../state";

type Filter = "all" | "watched" | "watchlist";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "watched", label: "Просмотренные" },
  { id: "watchlist", label: "Хочу посмотреть" },
];

function matches(status: Status, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "watchlist") return status === "watchlist";
  return status !== "watchlist";
}

export function LibraryPage() {
  const { items } = useAppState();
  const [filter, setFilter] = useState<Filter>("all");

  const list = useMemo(() => {
    return items
      .filter((item) => matches(item.status, filter))
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [items, filter]);

  const watched = items.filter((item) => item.status !== "watchlist").length;

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        коллекция
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Фильмография</h1>
      <p className="mt-2 text-sm text-mute">
        {watched} в фильмографии · {items.length - watched} в «Хочу посмотреть»
      </p>
      <div className="mt-6 mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
              filter === f.id
                ? "border-ink bg-ink text-canvas"
                : "border-hairline text-mute"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty text="Пока пусто. Открой фильм и добавь его в просмотренные или в «Хочу посмотреть»." />
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
                  {item.type === "tv" ? "сериал" : "фильм"}
                  {item.year ? ` · ${item.year}` : ""}
                  {item.status === "watchlist"
                    ? " · хочу посмотреть"
                    : item.rating
                      ? ` · ${item.rating}/10`
                      : " · просмотрено"}
                </p>
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