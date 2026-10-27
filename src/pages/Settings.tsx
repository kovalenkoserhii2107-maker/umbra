import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { authError, signOutAccount, useAuth, verifyEmail } from "../lib/auth";
import { PLATFORMS, REGIONS } from "../lib/providers";
import { isTv } from "../lib/tvMode";
import { useAppState } from "../state";
import { APP_VERSION } from "../version";
import { plural } from "../lib/format";
import { SteamPanel } from "../components/GameCollection";
import {
  importGames,
  localGamesCount,
  moveLocalGames,
  useGameCollection,
} from "../lib/gameStore";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-card p-5">
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  );
}

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-sm ${on ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`;

/** Everything about the account and the app in one place. */
export function SettingsPage() {
  const { settings, setSettings, exportJson, importJson, items, sync } =
    useAppState();
  const { account, error } = useAuth();
  const { games } = useGameCollection();
  const [localGames, setLocalGames] = useState(localGamesCount);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function action(fn: () => Promise<void>, success = "") {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setMessage(
        e instanceof Error && !("code" in e) ? e.message : authError(e),
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleProvider(id: number) {
    const has = settings.subscribed.includes(id);
    setSettings({
      subscribed: has
        ? settings.subscribed.filter((x) => x !== id)
        : [...settings.subscribed, id],
    });
  }

  /** One file with the films and series and the games. */
  function download() {
    const backup = { ...JSON.parse(exportJson()), games };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "umbra-library.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onImport(file: File) {
    if (file.size > 5_000_000) {
      setMessage("Максимальний розмір файлу — 5 МБ.");
      return;
    }
    await action(async () => {
      const text = await file.text();
      await importJson(text);
      // Backups made before games were in them have only films and series.
      const backup = JSON.parse(text) as { games?: unknown };
      if (Array.isArray(backup.games)) await importGames(backup.games);
    }, "Колекцію імпортовано. Збіжні записи оновлено, інші залишилися.");
  }

  async function checkUpdate() {
    setMessage("Перевіряю оновлення…");
    try {
      const reg = await navigator.serviceWorker?.getRegistration(
        import.meta.env.BASE_URL,
      );
      if (!reg) {
        setMessage(
          "Для перевірки оновлень перезавантаж сторінку з підключеним інтернетом.",
        );
        return;
      }
      await reg.update();
      setMessage(
        reg.waiting
          ? "Нова версія готова. Натисни «Оновити» в сповіщенні."
          : "У тебе остання версія.",
      );
    } catch {
      setMessage("Немає зв’язку. Спробуй перевірити пізніше.");
    }
  }

  return (
    <div className="rise max-w-2xl space-y-6">
      <div className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
          налаштування
        </p>
        <h1 className="mt-1 text-3xl tracking-tight">Профіль та налаштування</h1>
      </div>

      {message || error ? (
        <p role="status" className="text-sm text-accent">
          {message || error}
        </p>
      ) : null}

      {account ? (
        <Card title="Акаунт">
          <div className="mt-4 flex items-center gap-3">
            {account.picture ? (
              <img
                src={account.picture}
                alt=""
                className="h-11 w-11 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-sm text-canvas">
                {account.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate">{account.name}</p>
              <p className="truncate text-sm text-mute">
                {account.email}
                {account.verified ? " · підтверджена" : ""}
              </p>
            </div>
          </div>
          {sync === "pending" || sync === "offline" ? (
            <p className="mt-3 text-xs text-mute">
              Незбережені зміни надішлються в хмару після підключення до
              мережі.
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {!account.verified ? (
              <button
                disabled={busy}
                onClick={() =>
                  action(
                    verifyEmail,
                    "Лист надіслано. Перейди за посиланням у листі.",
                  )
                }
                className="rounded-full border border-hairline px-4 py-2 text-sm"
              >
                Підтвердити пошту
              </button>
            ) : null}
            <button
              disabled={busy}
              onClick={() => action(signOutAccount)}
              className="rounded-full border border-hairline px-4 py-2 text-sm text-mute"
            >
              Вийти з акаунту
            </button>
          </div>
        </Card>
      ) : null}

      {isTv ? null : <SteamPanel />}

      <Card title="Фільми та серіали">
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          Країна для «де дивитися» та цін
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button
              key={r.code}
              onClick={() => setSettings({ region: r.code })}
              className={chip(settings.region === r.code)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          Мої стрімінги
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const on = settings.subscribed.includes(p.id);
            return (
              <button
                key={p.id}
                aria-pressed={on}
                onClick={() => toggleProvider(p.id)}
                className={`inline-flex items-center gap-2 ${chip(on)}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: p.tint }}
                />
                {p.name}
              </button>
            );
          })}
        </div>
      </Card>

      {account && (!isTv || localGames > 0) ? (
        <Card title="Резервна копія">
          {isTv ? null : (
            <>
              <p className="mt-2 text-sm text-mute">
                {items.length} фільмів і серіалів та {games.length}{" "}
                {plural(games.length, "гра", "гри", "ігор")} в акаунті. Файл
                можна завантажити назад: збіжні записи оновляться, інші
                залишаться.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={download}
                  disabled={busy}
                  className="rounded-full border border-hairline px-4 py-2 text-sm"
                >
                  Завантажити
                </button>
                <label className="cursor-pointer rounded-full border border-hairline px-4 py-2 text-sm">
                  Імпортувати
                  <input
                    disabled={busy}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onImport(file);
                    }}
                  />
                </label>
              </div>
            </>
          )}
          {localGames ? (
            // Games saved on this device before the cloud: whose they are is
            // unknown, so they move only when the owner asks.
            <div
              className={isTv ? "mt-3" : "mt-5 border-t border-hairline pt-4"}
            >
              <p className="text-sm text-mute">
                На цьому пристрої залишилися ігри зі старої версії: {localGames}.
                Якщо вони твої, перенеси їх в акаунт.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await moveLocalGames();
                    setLocalGames(localGamesCount());
                  }, "Ігри з пристрою перенесено в акаунт.")
                }
                className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm"
              >
                Перенести в мій акаунт
              </button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {isTv ? null : (
        <Card title="Телевізор">
          <p className="mt-2 text-sm text-mute">
            Umbra для Android TV: увійди на телевізорі через цей акаунт — за
            QR-кодом або кодом з екрана.
          </p>
          <Link
            to="/tv-link"
            className="mt-4 inline-block rounded-full border border-hairline px-4 py-2 text-sm"
          >
            Увійти на телевізорі
          </Link>
        </Card>
      )}

      <Card title="Застосунок">
        <p className="mt-2 text-sm text-mute">
          Нові версії завантажуються самі. Збірка {APP_VERSION}.
        </p>
        <button
          onClick={checkUpdate}
          className="mt-4 rounded-full border border-hairline px-4 py-2 text-sm"
        >
          Перевірити оновлення
        </button>
      </Card>
    </div>
  );
}
