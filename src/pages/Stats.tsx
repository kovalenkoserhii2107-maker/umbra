import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Empty } from "../components";
import { ShareButton } from "../components/ShareButton";
import { plural } from "../lib/format";
import { useLibraryMeta } from "../lib/meta";
import { computeStats, statYears, type Bar } from "../lib/stats";
import { correctPosterUrl } from "../lib/tmdb";
import { useAppState } from "../state";

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-4">
      <p className="text-3xl tracking-tight">{value}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
        {label}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** Vertical bars for the 1–10 rating distribution; one series, no legend. */
function RatingChart({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="rounded-2xl border border-hairline bg-card px-3 pb-2 pt-4">
      <div className="flex h-32 items-end gap-1.5 border-b border-hairline">
        {bars.map((b) => (
          <div
            key={b.label}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            title={`Оценка ${b.label}: ${b.value}`}
            aria-label={`Оценка ${b.label}: ${b.value}`}
            role="img"
          >
            {b.value ? (
              <span className="font-mono text-[10px] text-ink">{b.value}</span>
            ) : null}
            <div
              className="w-full max-w-7 rounded-t bg-accent"
              style={{
                height: b.value ? `${Math.max(4, (b.value / max) * 100)}%` : 0,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {bars.map((b) => (
          <span
            key={b.label}
            className="flex-1 text-center font-mono text-[10px] text-mute"
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars with the value in ink beside each bar. */
function BarList({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="space-y-3 rounded-2xl border border-hairline bg-card p-4">
      {bars.map((b) => (
        <div key={b.label} title={`${b.label}: ${b.value}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{b.label}</span>
            <span className="shrink-0 font-mono text-xs text-mute">
              {b.value}
              {b.extra ? ` · ${b.extra}` : ""}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-hairline">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(b.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatsPage() {
  const { items } = useAppState();
  const { meta, loading } = useLibraryMeta(items);
  const years = useMemo(() => statYears(items), [items]);
  const [year, setYear] = useState<number | null>(null);
  const stats = useMemo(
    () => computeStats(items, meta, year),
    [items, meta, year],
  );
  const period = year ? `${year}` : "всё время";
  const seen = stats.movies + stats.shows;
  const summary = [
    `Мои итоги${year ? ` ${year}` : ""} в Umbra:`,
    `${stats.movies} ${plural(stats.movies, "фильм", "фильма", "фильмов")}`,
    `${stats.shows} ${plural(stats.shows, "сериал", "сериала", "сериалов")}`,
    `≈${stats.hours} ч`,
  ].join(" ");
  const shareText = `${summary}.${stats.genres[0] ? ` Любимый жанр — ${stats.genres[0].label.toLowerCase()}.` : ""}${stats.best[0] ? ` Лучшее: «${stats.best[0].title}» (${stats.best[0].rating}/10).` : ""}`;

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${active ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`;

  return (
    <div className="rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
            {year ? "итоги года" : "статистика"}
          </p>
          <h1 className="mt-1 text-3xl tracking-tight">
            {year ? `Итоги ${year}` : "Статистика"}
          </h1>
        </div>
        {seen ? (
          <ShareButton
            title={year ? `Итоги ${year}` : "Моя статистика"}
            text={shareText}
            path="/"
            label="Поделиться итогами"
          />
        ) : null}
      </div>

      <div className="row-scroll mt-4 flex gap-2 overflow-x-auto pb-1">
        <button className={chip(year === null)} onClick={() => setYear(null)}>
          Всё время
        </button>
        {years.map((y) => (
          <button
            key={y}
            className={chip(year === y)}
            onClick={() => setYear(y)}
          >
            {y}
          </button>
        ))}
      </div>

      {!seen ? (
        <Empty
          text={
            items.length
              ? `За ${period} пока ничего не отмечено просмотренным.`
              : "Отметь первые фильмы просмотренными — здесь появится статистика."
          }
        />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile
              label={plural(stats.movies, "фильм", "фильма", "фильмов")}
              value={stats.movies}
            />
            <Tile
              label={plural(stats.shows, "сериал", "сериала", "сериалов")}
              value={stats.shows}
            />
            <Tile
              label={loading ? "часов · считаю…" : "часов просмотра"}
              value={`≈${stats.hours}`}
            />
            <Tile
              label="средняя оценка"
              value={stats.average ? stats.average.toFixed(1) : "—"}
            />
          </div>
          <p className="mt-2 text-xs text-dim">
            Сейчас смотрю: {stats.watching} · в «Хочу посмотреть»:{" "}
            {stats.watchlist}
            {year ? " · год считается по дате отметки в Umbra" : ""}
          </p>

          {stats.best.length ? (
            <Section title="Лучшее">
              <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
                {stats.best.map((x) => (
                  <Link
                    key={`${x.type}-${x.id}`}
                    to={`/title/${x.type}/${x.id}`}
                    className="w-28 shrink-0"
                  >
                    {x.poster ? (
                      <img
                        src={correctPosterUrl(x.poster)}
                        alt=""
                        className="aspect-[2/3] w-full rounded-xl border border-hairline object-cover"
                      />
                    ) : (
                      <div className="aspect-[2/3] rounded-xl border border-hairline bg-card" />
                    )}
                    <p className="mt-1 line-clamp-2 text-sm">{x.title}</p>
                    <p className="font-mono text-[11px] text-accent">
                      {x.rating}/10
                    </p>
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}

          {stats.ratings.some((b) => b.value) ? (
            <Section title="Мои оценки">
              <RatingChart bars={stats.ratings} />
            </Section>
          ) : null}

          {stats.genres.length ? (
            <Section title="Любимые жанры">
              <BarList bars={stats.genres} />
            </Section>
          ) : loading ? (
            <p className="mt-8 text-sm text-mute">Собираю жанры…</p>
          ) : null}

          {stats.decades.length ? (
            <Section title="По годам выхода">
              <BarList bars={stats.decades} />
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
