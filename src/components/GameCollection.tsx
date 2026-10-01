import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Empty } from "../components";
import { CARD } from "./TitleDetails";
import { PlatformDots } from "./GameTile";
import { hoursLabel } from "./SteamPlay";
import {
  GAME_STATUSES,
  platformCounts,
  playedHours,
  sortEntries,
  statusLabel,
  type GameEntry,
  type GameStatus,
  type LibrarySort,
} from "../lib/gameEntry";
import {
  linkSteam,
  refreshSteam,
  steamErrorText,
  unlinkSteam,
  useGameCollection,
  type SyncReport,
} from "../lib/gameStore";
import { steamProfile, verifySteam } from "../lib/api";
import { steamLoginUrl, takeSteamReturn } from "../lib/steamLink";
import { PLATFORM_GROUPS, platformIds } from "../lib/igdb";
import { readStorage, writeStorage } from "../lib/storage";
import { dateLabel, plural } from "../lib/format";

const chip = (on: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${on ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`;

function ago(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

function report(r: SyncReport) {
  const parts = [
    r.added ? `добавлено ${r.added}` : "",
    r.updated ? `обновлено ${r.updated}` : "",
  ].filter(Boolean);
  return `${parts.length ? parts.join(", ") : "новых игр нет"}${r.missing ? `; ${r.missing} ${plural(r.missing, "игра", "игры", "игр")} из Steam не нашлось в IGDB` : ""}.`;
}

/** Connect Steam and see how fresh the import is; it refreshes by itself. */
export function SteamPanel() {
  const { steam, ready, syncing, syncReport, syncError } = useGameCollection();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const started = useRef(false);

  // Finishes a sign-in that just came back from Steam.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    const params = takeSteamReturn();
    if (!params) return;
    void (async () => {
      setBusy("Проверяю вход через Steam…");
      setError("");
      try {
        const { steamId } = await verifySteam(params);
        const profile = await steamProfile(steamId);
        await linkSteam(profile);
        setBusy("");
        await refreshSteam(steamId);
      } catch (e) {
        setError(steamErrorText(e));
        setBusy("");
      }
    })();
  }, [ready]);

  const status = busy || (syncing ? "Обновляю игры из Steam…" : "");
  const problem = error || syncError;
  return (
    <div className={`${CARD} mb-6 p-4`}>
      {steam ? (
        <div className="flex items-center gap-3">
          {steam.avatar ? (
            <img src={steam.avatar} alt="" className="h-11 w-11 rounded-xl" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">Steam · {steam.name}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
              {syncing
                ? "обновляется…"
                : steam.syncedAt
                  ? `обновлено ${ago(steam.syncedAt)}`
                  : "ещё не загружено"}
            </p>
          </div>
          <button
            type="button"
            disabled={!!status}
            onClick={() =>
              void unlinkSteam().catch((e) => setError(steamErrorText(e)))
            }
            className="text-xs text-dim"
          >
            Отключить
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm">Подключи Steam</p>
          <p className="mt-1 text-sm text-mute">
            Подтянем все игры с часами, недавние игры, список желаемого и
            достижения, и будем обновлять их сами при каждом заходе в раздел.
            Профиль и игровая информация в Steam должны быть открыты.
          </p>
          <a
            href={steamLoginUrl()}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-[#171a21] px-4 text-sm text-white ring-1 ring-[#66c0f4]/40 hover:ring-[#66c0f4]"
          >
            <span className="h-2 w-2 rounded-full bg-[#66c0f4]" />
            Войти через Steam
          </a>
        </div>
      )}
      {status ? (
        <p role="status" className="mt-3 text-sm text-mute">
          {status}
        </p>
      ) : null}
      {syncReport && !status && (syncReport.added || syncReport.missing) ? (
        <p className="mt-3 text-sm text-ok">Steam: {report(syncReport)}</p>
      ) : null}
      {problem ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** Keeps Steam fresh: runs on every visit to the games section (at most every 10 min). */
export function SteamAutoSync() {
  const { ready, steam } = useGameCollection();
  const { pathname } = useLocation();
  useEffect(() => {
    if (ready && steam) void refreshSteam();
  }, [ready, steam?.steamId, pathname]);
  return null;
}

const PLATFORM_KEY = "umbra.gameLibraryPlatform";
type PlatformFilter = "all" | (typeof PLATFORM_GROUPS)[number]["id"];

function lastPlayed(e: GameEntry) {
  if (!e.steam?.lastPlayed) return "";
  const days = Math.floor((Date.now() / 1000 - e.steam.lastPlayed) / 86400);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 30) return `${days} дн назад`;
  return dateLabel(
    new Date(e.steam.lastPlayed * 1000).toISOString().slice(0, 10),
  );
}

function Row({ e }: { e: GameEntry }) {
  const hours = playedHours(e);
  return (
    <Link
      to={`/games/${e.id}`}
      className="flex gap-3 rounded-xl border border-hairline bg-card p-2 hover:border-accent/40"
    >
      {e.cover ? (
        <img
          src={e.cover}
          alt=""
          loading="lazy"
          className="h-20 w-15 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-20 w-15 shrink-0 rounded-lg bg-canvas-soft" />
      )}
      <div className="min-w-0 flex-1 py-1">
        <p className="truncate">{e.title}</p>
        <p className="mt-0.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-dim">
          <PlatformDots platforms={platformIds(e.platforms)} />
          <span className="truncate">
            {[
              statusLabel(e.status),
              e.rating ? `${e.rating}/10` : "",
              hours ? `${hours.toLocaleString("ru-RU")} ч` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </p>
        {e.steam?.recent ? (
          <p className="mt-0.5 text-xs text-accent">
            {hoursLabel(e.steam.recent)} за 2 недели · {lastPlayed(e)}
          </p>
        ) : e.steam?.lastPlayed ? (
          <p className="mt-0.5 text-xs text-dim">запуск {lastPlayed(e)}</p>
        ) : null}
      </div>
    </Link>
  );
}

export function GameCollection() {
  const { games, ready } = useGameCollection();
  const [platform, setPlatformState] = useState<PlatformFilter>(() => {
    const saved = readStorage(PLATFORM_KEY);
    return PLATFORM_GROUPS.some((g) => g.id === saved)
      ? (saved as PlatformFilter)
      : "all";
  });
  const [status, setStatus] = useState<"all" | GameStatus>("all");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const setPlatform = (p: PlatformFilter) => {
    setPlatformState(p);
    writeStorage(PLATFORM_KEY, p);
  };

  const counts = platformCounts(games);
  const onPlatform =
    platform === "all"
      ? games
      : games.filter((g) => g.platforms.includes(platform));
  const statusCount = (s: GameStatus) =>
    onPlatform.filter((g) => g.status === s).length;
  const shown = sortEntries(
    status === "all"
      ? onPlatform
      : onPlatform.filter((g) => g.status === status),
    sort,
  );
  const totalHours = Math.round(
    onPlatform.reduce((sum, g) => sum + (playedHours(g) ?? 0), 0),
  );
  const recent = onPlatform
    .filter((g) => (g.steam?.recent ?? 0) > 0)
    .sort((a, b) => b.steam!.recent - a.steam!.recent);

  return (
    <>
      <p className="mb-4 text-sm text-mute">
        {onPlatform.length} {plural(onPlatform.length, "игра", "игры", "игр")}
        {totalHours ? ` · ${totalHours.toLocaleString("ru-RU")} ч` : ""}
        {` · ${statusCount("played")} пройдено`}
      </p>
      <div
        role="group"
        aria-label="Платформа"
        className="row-scroll mb-3 flex gap-2 overflow-x-auto pb-1"
      >
        <button
          type="button"
          aria-pressed={platform === "all"}
          onClick={() => setPlatform("all")}
          className={chip(platform === "all")}
        >
          Все <span className="opacity-60">{counts.all}</span>
        </button>
        {PLATFORM_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={platform === g.id}
            onClick={() => setPlatform(g.id)}
            className={chip(platform === g.id)}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: g.tint }}
            />
            {g.name} <span className="opacity-60">{counts[g.id]}</span>
          </button>
        ))}
      </div>
      <div className="row-scroll mb-3 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setStatus("all")}
          className={chip(status === "all")}
        >
          Все статусы
        </button>
        {GAME_STATUSES.filter((s) => statusCount(s.id)).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStatus(s.id)}
            className={chip(status === s.id)}
          >
            {s.label} <span className="opacity-60">{statusCount(s.id)}</span>
          </button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["recent", "Недавние"],
            ["hours", "Больше часов"],
            ["rating", "Оценка"],
            ["title", "По названию"],
          ] as Array<[LibrarySort, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSort(id)}
            className={chip(sort === id)}
          >
            {label}
          </button>
        ))}
      </div>
      {recent.length && status === "all" ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-medium tracking-tight">
            Недавно играл
          </h2>
          <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
            {recent.map((g) => (
              <Link key={g.id} to={`/games/${g.id}`} className="w-28 shrink-0">
                {g.cover ? (
                  <img
                    src={g.cover}
                    alt=""
                    loading="lazy"
                    className="aspect-[3/4] w-full rounded-xl border border-hairline object-cover"
                  />
                ) : (
                  <div className="aspect-[3/4] rounded-xl border border-hairline bg-card" />
                )}
                <p className="mt-1.5 line-clamp-2 text-sm leading-snug">
                  {g.title}
                </p>
                <p className="font-mono text-[10px] text-accent">
                  {hoursLabel(g.steam!.recent)} за 2 недели
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {!ready && !games.length ? (
        <p role="status" className="text-sm text-mute">
          Загружаю коллекцию…
        </p>
      ) : shown.length ? (
        <div className="space-y-2">
          {shown.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </div>
      ) : (
        <Empty text="Здесь пока пусто. Открой игру и отметь её, или подключи Steam." />
      )}
    </>
  );
}
