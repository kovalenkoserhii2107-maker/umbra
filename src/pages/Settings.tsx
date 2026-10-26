import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { authError, signOutAccount, useAuth, verifyEmail } from "../lib/auth";
import { PLATFORMS, REGIONS } from "../lib/providers";
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
      setMessage("Максимальный размер файла — 5 МБ.");
      return;
    }
    await action(async () => {
      const text = await file.text();
      await importJson(text);
      // Backups made before games were in them have only films and series.
      const backup = JSON.parse(text) as { games?: unknown };
      if (Array.isArray(backup.games)) await importGames(backup.games);
    }, "Коллекция импортирована. Совпадающие записи обновлены, остальные остались.");
  }

  async function checkUpdate() {
    setMessage("Проверяю обновления…");
    try {
      const reg = await navigator.serviceWorker?.getRegistration(
        import.meta.env.BASE_URL,
      );
      if (!reg) {
        setMessage(
          "Для проверки обновлений перезагрузи страницу при подключённом интернете.",
        );
        return;
      }
      await reg.update();
      setMessage(
        reg.waiting
          ? "Новая версия готова. Нажми «Обновить» в уведомлении."
          : "У тебя последняя версия.",
      );
    } catch {
      setMessage("Нет связи. Попробуй проверить позже.");
    }
  }

  return (
    <div className="rise max-w-2xl space-y-6">
      <div className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
          настройки
        </p>
        <h1 className="mt-1 text-3xl tracking-tight">Профиль и настройки</h1>
      </div>

      {message || error ? (
        <p role="status" className="text-sm text-accent">
          {message || error}
        </p>
      ) : null}

      {account ? (
        <Card title="Аккаунт">
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
                {account.verified ? " · подтверждена" : ""}
              </p>
            </div>
          </div>
          {sync === "pending" || sync === "offline" ? (
            <p className="mt-3 text-xs text-mute">
              Несохранённые изменения отправятся в облако после подключения к
              сети.
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {!account.verified ? (
              <button
                disabled={busy}
                onClick={() =>
                  action(
                    verifyEmail,
                    "Письмо отправлено. Перейди по ссылке в письме.",
                  )
                }
                className="rounded-full border border-hairline px-4 py-2 text-sm"
              >
                Подтвердить почту
              </button>
            ) : null}
            <button
              disabled={busy}
              onClick={() => action(signOutAccount)}
              className="rounded-full border border-hairline px-4 py-2 text-sm text-mute"
            >
              Выйти из аккаунта
            </button>
          </div>
        </Card>
      ) : null}

      <SteamPanel />

      <Card title="Фильмы и сериалы">
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          Страна для «где смотреть» и цен
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
          Мои стриминги
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

      {account ? (
        <Card title="Резервная копия">
          <p className="mt-2 text-sm text-mute">
            {items.length} фильмов и сериалов и {games.length}{" "}
            {plural(games.length, "игра", "игры", "игр")} в аккаунте. Файл можно
            загрузить обратно: совпадающие записи обновятся, остальные
            останутся.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={download}
              disabled={busy}
              className="rounded-full border border-hairline px-4 py-2 text-sm"
            >
              Скачать
            </button>
            <label className="cursor-pointer rounded-full border border-hairline px-4 py-2 text-sm">
              Загрузить
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
          {localGames ? (
            // Games saved on this device before the cloud: whose they are is
            // unknown, so they move only when the owner asks.
            <div className="mt-5 border-t border-hairline pt-4">
              <p className="text-sm text-mute">
                На этом устройстве остались игры из старой версии: {localGames}.
                Если они твои, перенеси их в аккаунт.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await moveLocalGames();
                    setLocalGames(localGamesCount());
                  }, "Игры с устройства перенесены в аккаунт.")
                }
                className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm"
              >
                Перенести в мой аккаунт
              </button>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card title="Телевизор">
        <p className="mt-2 text-sm text-mute">
          Umbra для Android TV: войди на телевизоре через этот аккаунт — по
          QR-коду или коду с экрана.
        </p>
        <Link
          to="/tv-link"
          className="mt-4 inline-block rounded-full border border-hairline px-4 py-2 text-sm"
        >
          Войти на телевизоре
        </Link>
      </Card>

      <Card title="Приложение">
        <p className="mt-2 text-sm text-mute">
          Новые версии загружаются сами. Сборка {APP_VERSION}.
        </p>
        <button
          onClick={checkUpdate}
          className="mt-4 rounded-full border border-hairline px-4 py-2 text-sm"
        >
          Проверить обновления
        </button>
      </Card>
    </div>
  );
}
