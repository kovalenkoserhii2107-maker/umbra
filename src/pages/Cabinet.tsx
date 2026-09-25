import { useEffect, useRef, useState } from 'react'
import { PLATFORMS, REGIONS } from '../lib/providers'
import {
  getGoogleClientId,
  loadAccount,
  parseCredential,
  saveAccount,
  subscribeAccount,
  type Account,
} from '../lib/auth'
import { useAppState } from '../state'
import { APP_VERSION } from '../version'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string
            callback: (res: { credential?: string }) => void
            auto_select?: boolean
            ux_mode?: string
          }) => void
          renderButton: (el: HTMLElement, cfg: Record<string, string | number>) => void
        }
      }
    }
  }
}

function loadGsi() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve()
      return
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-umbra-gsi]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('GSI')))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.umbraGsi = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('GSI'))
    document.head.appendChild(script)
  })
}

export function CabinetPage() {
  const { settings, setSettings, exportJson, importJson, items } = useAppState()
  const [account, setAccount] = useState<Account | null>(() => loadAccount())
  const [status, setStatus] = useState('')
  const buttonRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeAccount(() => setAccount(loadAccount())), [])

  useEffect(() => {
    if (account) return
    let gone = false
    loadGsi()
      .then(() => {
        if (gone || !buttonRef.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: getGoogleClientId(),
          ux_mode: 'popup',
          callback: (res) => {
            try {
              if (!res.credential) throw new Error('NO_CRED')
              saveAccount(parseCredential(res.credential))
              setStatus('')
            } catch {
              setStatus('Не удалось прочитать ответ Google')
            }
          },
        })
        buttonRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 280,
          locale: 'ru',
        })
      })
      .catch(() => setStatus('Не удалось подключить Google'))
    return () => {
      gone = true
    }
  }, [account])

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
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">кабинет</p>
        <h1 className="mt-1 text-3xl tracking-tight">Мой профиль</h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-dim">сборка {APP_VERSION}</p>
      </div>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        {account ? (
          <div className="flex items-center gap-4">
            {account.picture ? (
              <img src={account.picture} alt="" className="h-14 w-14 rounded-full border border-hairline object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-canvas">{account.name.slice(0, 1)}</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg tracking-tight">{account.name}</p>
              <p className="truncate text-sm text-mute">{account.email}</p>
            </div>
            <button onClick={() => saveAccount(null)} className="rounded-full border border-hairline px-3 py-1.5 text-xs text-mute">
              Выйти
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg">Вход через Google</h2>
            <p className="text-sm text-mute">
              Регистрация отдельно не нужна — Google создаёт аккаунт при первом входе.
            </p>
            <div ref={buttonRef} className="min-h-10" />
            {status ? <p className="text-sm text-accent">{status}</p> : null}
          </div>
        )}
      </section>

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
        <p className="mt-2 text-sm text-mute">Отметь сервисы, которые хочешь видеть в разделе платформ.</p>
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
