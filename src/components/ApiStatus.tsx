import { useAsync } from "../components";
import { apiHealth, apiUrl } from "../lib/api";

const SERVICES = [
  ["igdb", "IGDB", "каталог игр"],
  ["twitch", "Twitch", "что смотрят"],
  ["itad", "IsThereAnyDeal", "цены"],
  ["opencritic", "OpenCritic", "критики"],
  ["steam", "Steam", "библиотека"],
] as const;

/** Shows which game services the API worker has keys for. */
export function ApiStatus() {
  const configured = Boolean(apiUrl());
  const health = useAsync(
    () => (configured ? apiHealth() : Promise.resolve(null)),
    [configured],
  );
  return (
    <section className="rounded-2xl border border-hairline bg-card p-5">
      <h2 className="text-lg">Игровой сервер</h2>
      {!configured ? (
        <p className="mt-2 text-sm text-mute">
          Адрес сервера не задан: добавьте переменную API_URL в настройках
          репозитория.
        </p>
      ) : health.loading ? (
        <p className="mt-2 text-sm text-mute">Проверяю…</p>
      ) : !health.data ? (
        <p role="alert" className="mt-2 text-sm text-accent">
          Сервер не отвечает. Проверьте адрес API_URL и публикацию Worker.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {SERVICES.map(([id, name, role]) => {
            const ok = health.data!.services[id];
            return (
              <li
                key={id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {name} <span className="text-dim">· {role}</span>
                </span>
                <span className={ok ? "text-ok" : "text-dim"}>
                  {ok ? "✓ подключён" : "нет ключа"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
