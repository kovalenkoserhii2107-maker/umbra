import { useState } from "react";
import { useAuth } from "../lib/auth";
import { readStorage } from "../lib/storage";
import { PLATFORMS, REGIONS } from "../lib/providers";
import { useAppState } from "../state";
import { APP_VERSION } from "../version";
import { forgetDismissal, openInstallHelp } from "../lib/install";
import { hasBuildOmdbKey, ownOmdbKey, setOmdbKey } from "../lib/omdb";

export function SettingsPage() {
  const { settings, setSettings, exportJson, importJson, items } =
    useAppState();

  const { account } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [omdb, setOmdb] = useState(ownOmdbKey);
  const [omdbSaved, setOmdbSaved] = useState("");

  function toggleProvider(id: number) {
    const has = settings.subscribed.includes(id);
    setSettings({
      subscribed: has
        ? settings.subscribed.filter((x) => x !== id)
        : [...settings.subscribed, id],
    });
  }

  async function onImport(file: File) {
    if (file.size > 5_000_000) {
      setMessage("Максимальный размер файла — 5 МБ.");
      return;
    }
    setBusy(true);
    setMessage("Импортирую…");
    try {
      await importJson(await file.text());
      setMessage(
        "Коллекция импортирована. Совпадающие записи обновлены, остальные остались.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function legacyDownload() {
    const raw = readStorage("umbra.library");
    if (!raw) {
      setMessage("На этом устройстве нет старой полки.");
      return;
    }
    downloadText(
      JSON.stringify({ version: 1, items: JSON.parse(raw) }, null, 2),
      "umbra-legacy-backup.json",
    );
  }
  function downloadText(text: string, name: string) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function download() {
    downloadText(exportJson(), "umbra-library.json");
  }
  function showInstallAgain() {
    forgetDismissal();
    openInstallHelp();
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
          : "Проверка завершена. Если новая версия доступна, появится предложение обновиться.",
      );
    } catch {
      setMessage("Нет связи. Попробуй проверить позже.");
    }
  }
  return (
    <div className="rise max-w-2xl space-y-10">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
          настройки
        </p>
        <h1 className="mt-1 text-3xl tracking-tight">Как тебе удобно</h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-dim">
          сборка {APP_VERSION}
        </p>
      </div>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Обновление</h2>
        <p className="mt-2 text-sm text-mute">
          Новые версии загружаются автоматически. Коллекция сохраняется в
          аккаунте.
        </p>
        <button
          onClick={checkUpdate}
          className="mt-4 rounded-full bg-ink px-4 py-2 text-sm text-canvas"
        >
          Проверить обновления
        </button>
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Установка</h2>
        <p className="mt-2 text-sm text-mute">
          На iPhone: Поделиться → На экран «Домой».
        </p>
        <button
          onClick={showInstallAgain}
          className="mt-4 rounded-full border border-hairline px-4 py-2 text-sm"
        >
          Показать подсказку снова
        </button>
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Rotten Tomatoes и Metacritic</h2>
        <p className="mt-2 text-sm text-mute">
          Свежие оценки критиков приходят через OMDb. Нужен бесплатный ключ:
          зарегистрируйся на{" "}
          <a
            href="https://www.omdbapi.com/apikey.aspx"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-4"
          >
            omdbapi.com
          </a>
          , подтверди почту и вставь ключ сюда. Без ключа оценки берутся из
          Wikidata и есть не у всех фильмов.
        </p>
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setOmdbKey(omdb);
            setOmdbSaved(
              omdb.trim()
                ? "Ключ сохранён на этом устройстве."
                : "Ключ удалён с этого устройства.",
            );
          }}
        >
          <input
            value={omdb}
            onChange={(e) => setOmdb(e.target.value)}
            aria-label="Ключ OMDb"
            placeholder={
              hasBuildOmdbKey() ? "Ключ уже задан в сборке" : "Ключ OMDb"
            }
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            className="h-10 min-w-0 flex-1 rounded-full border border-hairline bg-canvas px-4 font-mono text-sm outline-none focus:border-accent"
          />
          <button className="rounded-full bg-ink px-4 py-2 text-sm text-canvas">
            Сохранить
          </button>
        </form>
        {omdbSaved ? (
          <p role="status" className="mt-2 text-xs text-accent">
            {omdbSaved}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Регион «где смотреть»</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button
              key={r.code}
              onClick={() => setSettings({ region: r.code })}
              className={`rounded-full border px-3 py-1 text-sm ${
                settings.region === r.code
                  ? "border-ink bg-ink text-canvas"
                  : "border-hairline text-mute"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Мои платформы</h2>
        <p className="mt-2 text-sm text-mute">
          Отметь сервисы для раздела платформ.
        </p>
        <div className="mt-4 space-y-2">
          {PLATFORMS.map((p) => {
            const on = settings.subscribed.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleProvider(p.id)}
                className="flex w-full items-center justify-between rounded-xl border border-hairline px-3 py-3 text-left"
              >
                <span className="flex items-center gap-3">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: p.tint }}
                  />
                  {p.name}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-wider text-dim">
                  {on ? "включена" : "скрыта"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {message ? (
        <p role="status" className="text-sm text-accent">
          {message}
        </p>
      ) : null}
      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Коллекция</h2>
        <p className="mt-2 text-sm text-mute">
          {account
            ? `${items.length} записей в твоём аккаунте. Импорт добавляет записи и обновляет совпадающие; остальные остаются.`
            : "Войди, чтобы экспортировать или импортировать коллекцию."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={download}
            disabled={!account || busy}
            className="rounded-full border border-hairline px-4 py-2 text-sm"
          >
            Экспорт JSON
          </button>
          <label className="cursor-pointer rounded-full border border-hairline px-4 py-2 text-sm">
            Импорт JSON
            <input
              disabled={!account || busy}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
              }}
            />
          </label>
        </div>
      </section>
      {readStorage("umbra.library") ? (
        <section className="rounded-2xl border border-hairline p-5">
          <h2 className="text-lg">Полка из старой версии</h2>
          <p className="mt-2 text-sm text-mute">
            На устройстве остались старые записи без привязки к владельцу.
            Скачай копию, проверь её и импортируй в свой аккаунт, если это твоя
            полка.
          </p>
          <button
            onClick={() => {
              try {
                legacyDownload();
              } catch {
                setMessage(
                  "Старая полка повреждена. Не удаляй данные браузера.",
                );
              }
            }}
            className="mt-3 text-sm text-accent"
          >
            Скачать старую полку
          </button>
        </section>
      ) : null}
    </div>
  );
}
