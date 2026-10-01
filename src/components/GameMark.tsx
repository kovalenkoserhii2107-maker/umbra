import { useState } from "react";
import {
  GAME_STATUSES,
  playedHours,
  type GameEntry,
  type GameStatus,
} from "../lib/gameEntry";
import {
  removeGameEntry,
  saveGameEntry,
  useGameCollection,
} from "../lib/gameStore";
import { PLATFORM_GROUPS, type PlatformGroupId } from "../lib/igdb";
import { useMyPlatforms } from "../lib/myPlatforms";

/** What the collection keeps about a game, plus where it can be played. */
export type MarkedGame = {
  id: number;
  title: string;
  cover: string;
  year: string;
  genre: string;
  /** Platform groups the game exists on. */
  groups: PlatformGroupId[];
};

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.4 14.7 8l6.2.9-4.5 4.4 1.1 6.2L12 16.6 6.5 19.5l1.1-6.2L3.1 8.9 9.3 8 12 2.4Z"
      />
    </svg>
  );
}

const pill = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm ${on ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`;

export function GameMark({ game }: { game: MarkedGame }) {
  const { games, uid } = useGameCollection();
  const mine = useMyPlatforms();
  const entry = games.find((g) => g.id === game.id);
  const [panel, setPanel] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{
    platforms: PlatformGroupId[];
    rating: number;
    hours: string;
    note: string;
  }>({ platforms: [], rating: 0, hours: "", note: "" });

  const choices = PLATFORM_GROUPS.filter((g) => game.groups.includes(g.id));
  const guess = (): PlatformGroupId[] => {
    if (entry?.platforms.length) return entry.platforms;
    const owned = game.groups.filter((g) => mine.includes(g));
    if (owned.length === 1) return owned;
    return game.groups.length === 1 ? game.groups : [];
  };

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить игру.");
    } finally {
      setBusy(false);
    }
  }

  function base(): Omit<GameEntry, "updatedAt"> {
    return {
      id: game.id,
      title: game.title,
      cover: game.cover,
      year: game.year,
      genre: game.genre,
      platforms: guess(),
      status: "want",
      rating: null,
      note: "",
      hours: null,
      ...(entry ?? {}),
    };
  }

  function openPanel(next?: Partial<typeof draft>) {
    setDraft({
      platforms: entry?.platforms.length ? entry.platforms : guess(),
      rating: entry?.rating ?? 0,
      hours: entry?.hours != null ? String(entry.hours) : "",
      note: entry?.note ?? "",
      ...next,
    });
    setPanel(true);
  }

  function choose(status: GameStatus) {
    const platforms = guess();
    void run(() => saveGameEntry({ ...base(), platforms, status }));
    // Several possible platforms: ask where it is played.
    if (!platforms.length && choices.length > 1) openPanel({ platforms });
  }

  function save() {
    const hours = draft.hours.trim()
      ? Number(draft.hours.replace(",", "."))
      : null;
    if (hours !== null && !(hours >= 0 && hours <= 100000)) {
      setError("Часы — число от 0 до 100000.");
      return;
    }
    void run(async () => {
      await saveGameEntry({
        ...base(),
        platforms: draft.platforms,
        rating: draft.rating || null,
        hours,
        note: draft.note.trim(),
      });
      setPanel(false);
    });
  }

  if (!uid) return null;
  const hours = entry ? playedHours(entry) : null;
  const statuses = GAME_STATUSES.filter(
    (s) => s.id !== "owned" || entry?.status === "owned",
  );

  return (
    <div className="mt-6 rounded-2xl border border-hairline bg-card p-4">
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            aria-pressed={entry?.status === s.id}
            onClick={() =>
              entry?.status === s.id ? openPanel() : choose(s.id)
            }
            className={pill(entry?.status === s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {entry ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
          {entry.platforms.length ? (
            <span>
              {PLATFORM_GROUPS.filter((g) => entry.platforms.includes(g.id))
                .map((g) => g.name)
                .join(" · ")}
            </span>
          ) : (
            <span className="text-dim">платформа не указана</span>
          )}
          {entry.rating ? (
            <span className="font-mono text-accent">{entry.rating}/10</span>
          ) : null}
          {hours ? <span>{hours} ч</span> : null}
          {entry.note ? (
            <span className="max-w-full truncate italic">«{entry.note}»</span>
          ) : null}
          {!panel ? (
            <button
              type="button"
              onClick={() => openPanel()}
              className="text-accent"
            >
              Изменить
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}
      {panel ? (
        <div className="mt-4 space-y-4">
          {choices.length ? (
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                Где играю
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Где играю"
              >
                {choices.map((g) => {
                  const on = draft.platforms.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          platforms: on
                            ? d.platforms.filter((p) => p !== g.id)
                            : [...d.platforms, g.id],
                        }))
                      }
                      className={`inline-flex items-center gap-2 ${pill(on)} text-xs`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: g.tint }}
                      />
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              Оценка
            </p>
            <div
              className="flex flex-wrap gap-0.5"
              role="radiogroup"
              aria-label="Оценка"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
                <button
                  key={score}
                  type="button"
                  aria-label={`${score} из 10`}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      rating: d.rating === score ? 0 : score,
                    }))
                  }
                  className={`rounded-md p-0.5 ${score <= draft.rating ? "text-accent" : "text-dim"}`}
                >
                  <StarIcon />
                </button>
              ))}
            </div>
          </div>
          {!entry?.steam?.minutes ? (
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                Часов в игре
              </span>
              <input
                inputMode="decimal"
                value={draft.hours}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, hours: e.target.value }))
                }
                placeholder="например, 40"
                className="w-32 rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-accent/60"
              />
            </label>
          ) : null}
          <textarea
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            placeholder="Комментарий"
            className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-accent/60"
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-full bg-accent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#1a1008] disabled:opacity-40"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => setPanel(false)}
              className="rounded-full border border-hairline px-4 py-2 text-sm text-mute"
            >
              Отмена
            </button>
            {entry ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await removeGameEntry(game.id);
                    setPanel(false);
                  })
                }
                className="ml-auto rounded-full border border-hairline px-4 py-2 text-sm text-dim"
              >
                Убрать из коллекции
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
