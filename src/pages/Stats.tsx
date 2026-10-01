import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Empty } from "../components";
import { ShareButton } from "../components/ShareButton";
import { plural } from "../lib/format";
import { useLibraryMeta } from "../lib/meta";
import { computeStats, statYears, type Bar } from "../lib/stats";
import { computeGameStats, gameYears, type GameBar } from "../lib/gameStats";
import { playedHours, statusLabel, type GameEntry } from "../lib/gameEntry";
import { useGameCollection } from "../lib/gameStore";
import { correctPosterUrl } from "../lib/tmdb";
import { readStorage, writeStorage } from "../lib/storage";
import { useAppState, type LibraryItem } from "../state";

/* ------------------------------------------------------------ pieces */

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
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg tracking-tight">{title}</h2>
      {hint ? <p className="mt-0.5 text-xs text-dim">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

type Card = {
  key: string;
  title: string;
  image: string;
  href: string;
  sub: string;
};

function Cards({ cards }: { cards: Card[] }) {
  return (
    <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
      {cards.map((c) => (
        <Link key={c.key} to={c.href} className="w-24 shrink-0">
          {c.image ? (
            <img
              src={c.image}
              alt=""
              loading="lazy"
              className="aspect-[2/3] w-full rounded-xl border border-hairline object-cover"
            />
          ) : (
            <div className="flex aspect-[2/3] items-end rounded-xl border border-hairline bg-canvas p-2 text-xs text-mute">
              {c.title}
            </div>
          )}
          <p className="mt-1 line-clamp-2 text-xs leading-snug">{c.title}</p>
          {c.sub ? (
            <p className="font-mono text-[10px] text-accent">{c.sub}</p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

/**
 * Rows with a bar each; tapping a row shows the titles behind its number.
 * One row is open at a time.
 */
function Breakdown<T>({
  rows,
  card,
  star,
}: {
  rows: Array<{ label: string; value: number; extra?: string; items?: T[] }>;
  card: (item: T) => Card;
  /** Rating rows: the label is a score. */
  star?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rounded-2xl border border-hairline bg-card p-2">
      {rows.map((r) => {
        const isOpen = open === r.label && r.value > 0;
        return (
          <div key={r.label}>
            <button
              type="button"
              disabled={!r.value}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : r.label)}
              className={`grid w-full grid-cols-[8rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-2 text-left ${r.value ? "hover:bg-canvas/50" : "opacity-40"} ${isOpen ? "bg-canvas/60" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">
                  {star ? (
                    <>
                      <span className="text-accent">★</span> {r.label}
                    </>
                  ) : (
                    r.label
                  )}
                </span>
                {r.extra ? (
                  <span className="block truncate font-mono text-[10px] text-dim">
                    {r.extra}
                  </span>
                ) : null}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-hairline">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${(r.value / max) * 100}%` }}
                />
              </span>
              <span className="flex w-10 items-center justify-end gap-1.5 font-mono text-xs text-mute">
                {r.value}
                <span aria-hidden="true" className="text-dim">
                  {r.value ? (isOpen ? "▴" : "▾") : ""}
                </span>
              </span>
            </button>
            {isOpen && r.items?.length ? (
              <div className="px-2 pb-2 pt-1">
                <Cards cards={r.items.map(card)} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const chip = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${active ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`;

function Periods({
  years,
  year,
  onChange,
}: {
  years: number[];
  year: number | null;
  onChange: (y: number | null) => void;
}) {
  return (
    <div className="row-scroll mt-4 flex gap-2 overflow-x-auto pb-1">
      <button className={chip(year === null)} onClick={() => onChange(null)}>
        Всё время
      </button>
      {years.map((y) => (
        <button
          key={y}
          className={chip(year === y)}
          onClick={() => onChange(y)}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ films */

const filmCard = (x: LibraryItem): Card => ({
  key: `${x.type}-${x.id}`,
  title: x.title,
  image: x.poster ? correctPosterUrl(x.poster) : "",
  href: `/title/${x.type}/${x.id}`,
  sub: x.rating ? `${x.rating}/10` : x.year,
});

function FilmStats() {
  const { items } = useAppState();
  const { meta, loading } = useLibraryMeta(items);
  const years = useMemo(() => statYears(items), [items]);
  const [year, setYear] = useState<number | null>(null);
  const stats = useMemo(
    () => computeStats(items, meta, year),
    [items, meta, year],
  );
  const seen = stats.movies + stats.shows;
  const shareText = `Мои итоги${year ? ` ${year}` : ""} в Umbra: ${stats.movies} ${plural(stats.movies, "фильм", "фильма", "фильмов")}, ${stats.shows} ${plural(stats.shows, "сериал", "сериала", "сериалов")}, ≈${stats.hours} ч.${stats.genres[0] ? ` Любимый жанр — ${stats.genres[0].label.toLowerCase()}.` : ""}${stats.best[0] ? ` Лучшее: «${stats.best[0].title}» (${stats.best[0].rating}/10).` : ""}`;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <Periods years={years} year={year} onChange={setYear} />
        {seen ? (
          <ShareButton
            title={year ? `Итоги ${year}` : "Моя статистика"}
            text={shareText}
            path="/"
            label="Поделиться итогами"
          />
        ) : null}
      </div>
      {!seen ? (
        <Empty
          text={
            items.length
              ? "За этот период ничего не отмечено просмотренным."
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
              value={
                stats.average ? stats.average.toLocaleString("ru-RU") : "—"
              }
            />
          </div>
          <p className="mt-2 text-xs text-dim">
            Смотрю сейчас: {stats.watching} · в «Хочу посмотреть»:{" "}
            {stats.watchlist}
            {year ? " · год — по дате отметки в Umbra" : ""}
          </p>

          {stats.best.length ? (
            <Section title="Лучшее">
              <Cards cards={stats.best.map(filmCard)} />
            </Section>
          ) : null}

          {stats.ratings.some((b) => b.value) ? (
            <Section
              title="Мои оценки"
              hint="Сколько фильмов и сериалов получили каждую оценку. Нажми на строку — покажем, какие."
            >
              <Breakdown<LibraryItem>
                rows={stats.ratings}
                card={filmCard}
                star
              />
            </Section>
          ) : null}

          {stats.genres.length ? (
            <Section
              title="Любимые жанры"
              hint="Сколько тайтлов и средняя оценка в жанре."
            >
              <Breakdown<LibraryItem>
                rows={stats.genres as Bar[]}
                card={filmCard}
              />
            </Section>
          ) : loading ? (
            <p className="mt-8 text-sm text-mute">Собираю жанры…</p>
          ) : null}

          {stats.decades.length ? (
            <Section title="По годам выхода">
              <Breakdown<LibraryItem> rows={stats.decades} card={filmCard} />
            </Section>
          ) : null}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------ games */

const gameCard =
  (show: "hours" | "rating" | "status") =>
  (g: GameEntry): Card => {
    const h = playedHours(g);
    return {
      key: String(g.id),
      title: g.title,
      image: g.cover,
      href: `/games/${g.id}`,
      sub:
        show === "hours" && h
          ? `${h.toLocaleString("ru-RU")} ч`
          : show === "rating" && g.rating
            ? `${g.rating}/10`
            : show === "status"
              ? statusLabel(g.status).toLowerCase()
              : "",
    };
  };

function GameStats() {
  const { games, ready, uid } = useGameCollection();
  const years = useMemo(() => gameYears(games), [games]);
  const [year, setYear] = useState<number | null>(null);
  const s = useMemo(() => computeGameStats(games, year), [games, year]);
  const shareText = `Мои игры${year ? ` за ${year}` : ""} в Umbra: ${s.total} ${plural(s.total, "игра", "игры", "игр")}, пройдено ${s.played}, ${s.hours.toLocaleString("ru-RU")} ч.${s.mostPlayed[0] ? ` Больше всего — «${s.mostPlayed[0].title}».` : ""}`;

  if (uid && !ready && !games.length)
    return (
      <p role="status" className="mt-6 text-sm text-mute">
        Загружаю игры…
      </p>
    );
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <Periods years={years} year={year} onChange={setYear} />
        {s.total ? (
          <ShareButton
            title={year ? `Игры ${year}` : "Мои игры"}
            text={shareText}
            path="/games"
            label="Поделиться итогами"
          />
        ) : null}
      </div>
      {!s.total ? (
        <Empty text="Отметь игры или подключи Steam в настройках — здесь появится статистика." />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile
              label={plural(s.total, "игра", "игры", "игр")}
              value={s.total}
            />
            <Tile label="пройдено" value={s.played} />
            <Tile
              label="часов в играх"
              value={s.hours.toLocaleString("ru-RU")}
            />
            <Tile
              label="средняя оценка"
              value={s.average ? s.average.toLocaleString("ru-RU") : "—"}
            />
          </div>
          <p className="mt-2 text-xs text-dim">
            Играю сейчас: {s.playing} · в «Хочу поиграть»: {s.want}
            {s.recentHours
              ? ` · за 2 недели в Steam: ${s.recentHours.toLocaleString("ru-RU")} ч`
              : ""}
          </p>

          {s.recent.length ? (
            <Section title="Недавно играл" hint="Steam, последние две недели.">
              <Cards
                cards={s.recent.map((g) => ({
                  ...gameCard("hours")(g),
                  sub: `${(Math.round(g.steam!.recent / 6) / 10).toLocaleString("ru-RU")} ч за 2 нед.`,
                }))}
              />
            </Section>
          ) : null}

          {s.mostPlayed.length ? (
            <Section title="Больше всего часов">
              <Cards cards={s.mostPlayed.map(gameCard("hours"))} />
            </Section>
          ) : null}

          {s.best.length ? (
            <Section title="Лучшее">
              <Cards cards={s.best.map(gameCard("rating"))} />
            </Section>
          ) : null}

          <Section title="По статусам" hint="Нажми на строку — покажем игры.">
            <Breakdown<GameEntry> rows={s.statuses} card={gameCard("hours")} />
          </Section>

          {s.platforms.length ? (
            <Section
              title="По платформам"
              hint="Игр и часов на каждой платформе."
            >
              <Breakdown<GameEntry>
                rows={s.platforms}
                card={gameCard("hours")}
              />
            </Section>
          ) : null}

          {s.ratings.some((b) => b.value) ? (
            <Section
              title="Мои оценки"
              hint="Сколько игр получили каждую оценку. Нажми на строку — покажем, какие."
            >
              <Breakdown<GameEntry>
                rows={s.ratings}
                card={gameCard("status")}
                star
              />
            </Section>
          ) : null}

          {s.genres.length ? (
            <Section title="Жанры">
              <Breakdown<GameEntry>
                rows={s.genres as GameBar[]}
                card={gameCard("rating")}
              />
            </Section>
          ) : null}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------ page */

const TAB_KEY = "umbra.statsTab";

export function StatsPage() {
  const [params, setParams] = useSearchParams();
  const tab =
    params.get("tab") === "games" ||
    (!params.get("tab") && readStorage(TAB_KEY) === "games")
      ? "games"
      : "films";
  const choose = (next: "films" | "games") => {
    writeStorage(TAB_KEY, next);
    setParams(next === "games" ? { tab: "games" } : {}, { replace: true });
  };
  const tabClass = (on: boolean) =>
    `flex-1 rounded-full px-4 py-2 text-sm ${on ? "bg-ink text-canvas" : "text-mute"}`;
  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        статистика
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Статистика и итоги</h1>
      <div
        role="tablist"
        aria-label="Раздел"
        className="mt-4 flex max-w-sm rounded-full border border-hairline bg-card p-1"
      >
        <button
          role="tab"
          aria-selected={tab === "films"}
          onClick={() => choose("films")}
          className={tabClass(tab === "films")}
        >
          Фильмы и сериалы
        </button>
        <button
          role="tab"
          aria-selected={tab === "games"}
          onClick={() => choose("games")}
          className={tabClass(tab === "games")}
        >
          Игры
        </button>
      </div>
      {tab === "games" ? <GameStats /> : <FilmStats />}
    </div>
  );
}
