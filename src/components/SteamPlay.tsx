import { useAsync } from "../components";
import { CARD, Section } from "./TitleDetails";
import { steamAchievements, type SteamAchievement } from "../lib/api";
import { useGameCollection } from "../lib/gameStore";
import { dateLabel } from "../lib/format";

const day = (seconds: number) =>
  seconds ? dateLabel(new Date(seconds * 1000).toISOString().slice(0, 10)) : "";

export const hoursLabel = (minutes: number) =>
  minutes < 60
    ? `${minutes} мин`
    : `${(Math.round(minutes / 6) / 10).toLocaleString("ru-RU")} ч`;

function Achievement({ a }: { a: SteamAchievement }) {
  return (
    <li className="flex items-center gap-3">
      {a.icon ? (
        <img
          src={a.icon}
          alt=""
          loading="lazy"
          className={`h-10 w-10 shrink-0 rounded-lg border border-hairline ${a.unlocked ? "" : "opacity-50 grayscale"}`}
        />
      ) : (
        <span className="h-10 w-10 shrink-0 rounded-lg border border-hairline" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{a.name}</span>
        {a.description ? (
          <span className="block truncate text-xs text-mute">
            {a.description}
          </span>
        ) : null}
      </span>
      {a.percent !== null ? (
        <span
          className={`shrink-0 font-mono text-[11px] ${a.percent < 10 ? "text-accent" : "text-dim"}`}
        >
          {a.percent.toLocaleString("ru-RU")}%
        </span>
      ) : null}
    </li>
  );
}

/** The player's own Steam numbers for a game they own. */
export function SteamPlay({ gameId }: { gameId: number }) {
  const { steam, games } = useGameCollection();
  const play = games.find((g) => g.id === gameId)?.steam;
  const progress = useAsync(
    () =>
      steam && play
        ? steamAchievements(steam.steamId, play.appId)
        : Promise.resolve(null),
    [steam?.steamId, play?.appId],
  );
  if (!steam || !play) return null;
  const a = progress.data;
  const share = a?.total ? Math.round((a.achieved / a.total) * 100) : 0;
  return (
    <Section title="Мой Steam">
      <div className={`${CARD} p-4`}>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {(
            [
              ["Всего", play.minutes ? hoursLabel(play.minutes) : "—"],
              ["За 2 недели", play.recent ? hoursLabel(play.recent) : "—"],
              ["Последний запуск", day(play.lastPlayed) || "—"],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                {label}
              </dt>
              <dd className="mt-1 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        {a && a.total ? (
          <div className="mt-4 border-t border-hairline pt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span>Достижения</span>
              <span className="font-mono text-mute">
                {a.achieved} из {a.total} · {share}%
              </span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-hairline"
              role="progressbar"
              aria-valuenow={share}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Получено достижений"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${share}%` }}
              />
            </div>
            {a.rarest.length ? (
              <>
                <p className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                  Самые редкие из полученных
                </p>
                <ul className="space-y-2">
                  {a.rarest.slice(0, 4).map((x) => (
                    <Achievement key={x.name} a={x} />
                  ))}
                </ul>
              </>
            ) : null}
            {a.next.length ? (
              <>
                <p className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                  Проще всего получить следующими
                </p>
                <ul className="space-y-2">
                  {a.next.map((x) => (
                    <Achievement key={x.name} a={x} />
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : progress.error ? (
          <p className="mt-4 text-xs text-dim">
            Достижения недоступны: в игре их нет или Steam скрывает их
            настройками приватности.
          </p>
        ) : null}
      </div>
    </Section>
  );
}
