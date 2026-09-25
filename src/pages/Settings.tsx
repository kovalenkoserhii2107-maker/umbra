import { PLATFORMS, REGIONS } from '../lib/providers'
import { useAppState } from '../state'
import { APP_VERSION } from '../version'

export function SettingsPage() {
  const { settings, setSettings, exportJson, importJson, items } = useAppState()

  function toggleProvider(id: number) {
    const has = settings.subscribed.includes(id)
    setSettings({
      subscribed: has ? settings.subscribed.filter((x) => x !== id) : [...settings.subscribed, id],
    })
  }

  function onImport(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try { importJson(String(reader.result)) } catch { alert('Не получилось прочить файл') }
    }
    reader.readAsText(file)
  }

  function download() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'umbra-library.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function showInstallAgain() {
    localStorage.removeItem('umbra.installDismissed')
    window.location.assign(`${import.meta.env.BASE_URL}#/`)
  }

  async function forceUpdate() {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations()
      await Promise.all((regs || []).map((r) => r.unregister()))
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } catch {
      /* ignore */
    }
    localStorage.setItem('umbra.appVersion', APP_VERSION)
    window.location.replace(`${import.meta.env.BASE_URL}?v=${APP_VERSION}#/`)
  }

  return (
    <div className="rise max-w-2xl space-y-10">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">настройки</p>
        <h1 className="mt-1 text-3xl tracking-tight">Как тебе удобно</h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-dim">сборка {APP_VERSION}</p>
      </div>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Обновление</h2>
        <p className="mt-2 text-sm text-mute">Сброс кэша и перезагрузка до текущей сборки.</p>
        <button onClick={forceUpdate} className="mt-4 rounded-full bg-ink px-4 py-2 text-sm text-canvas">
          Обновить до {APP_VERSION}
        </button>
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Установка</h2>
        <p className="mt-2 text-sm text-mute">На iPhone: Поделиться → На экран «Домой».</p>
        <button onClick={showInstallAgain} className="mt-4 rounded-full border border-hairline px-4 py-2 text-sm">
          Показать подсказку снова
        </button>
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Регион «где смотреть»</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button
              key={r.code}
              onClick={() => setSettings({ region: r.code })}
              className={`rounded-full border px-3 py-1 text-sm ${
                settings.region === r.code ? 'border-ink bg-ink text-canvas' : 'border-hairline text-mute'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Мои платформы</h2>
        <p className="mt-2 text-sm text-mute">Отметь сервисы для раздела платформ.</p>
        <div className="mt-4 space-y-2">
          {PLATFORMS.map((p) => {
            const on = settings.subscribed.includes(p.id)
            return (
              <button key={p.id} onClick={() => toggleProvider(p.id)} className="flex w-full items-center justify-between rounded-xl border border-hairline px-3 py-3 text-left">
                <span className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.tint }} />
                  {p.name}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-wider text-dim">{on ? 'включена' : 'скрыта'}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-lg">Полка</h2>
        <p className="mt-2 text-sm text-mute">{items.length} записей на этом устройстве.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={download} className="rounded-full border border-hairline px-4 py-2 text-sm">Экспорт JSON</button>
          <label className="cursor-pointer rounded-full border border-hairline px-4 py-2 text-sm">
            Импорт JSON
            <input type="file" accept="application/json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) onImport(file) }} />
          </label>
        </div>
      </section>
    </div>
  )
}
