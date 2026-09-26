import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Empty } from "../components";
import { plural } from "../lib/format";
import { useAppState, type Status } from "../state";

const FILTERS: Array<{ id: Status | "all"; label: string }> = [
  { id: "all", label: "Все" },
  { id: "watchlist", label: "Хочу" },
  { id: "watching", label: "Смотрю" },
  { id: "watched", label: "Видел" },
  { id: "dropped", label: "Бросил" },
];

export function LibraryPage() {
  const { items } = useAppState();
  const [filter, setFilter] = useState<Status | "all">("all");

  const list = useMemo(() => {
    const filtered =
      filter === "all" ? items : items.filter((i) => i.status === filter);
    return filtered.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }, [items, filter]);

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        полка
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Личная медиатека</h1>
      <p className="mt-2 text-sm text-mute">
        {items.length} {plural(items.length, "тайтл", "тайтла", "тайтлов")} ·
        личная полка твоего аккаунта
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
        <Empty text="Полка пуста. Добавляй тайтлы со страницы фильма или сериала." />
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
                  src={item.poster}
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
                  {item.rating ? ` · твоя ${item.rating}/10` : ""}
                </p>
                {item.note ? (
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
