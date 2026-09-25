import { useEffect, useRef, useState } from 'react'
import {
  getGoogleClientId,
  loadAccount,
  parseCredential,
  saveAccount,
  subscribeAccount,
  type Account,
} from '../lib/auth'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string
            callback: (res: { credential?: string }) => void
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

  return (
    <div className="rise max-w-2xl space-y-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">кабинет</p>
        <h1 className="mt-1 text-3xl tracking-tight">Мой профиль</h1>
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
            <p className="text-sm text-mute">Регистрация отдельно не нужна — Google создаёт аккаунт при первом входе.</p>
            <div ref={buttonRef} className="min-h-10" />
            {status ? <p className="text-sm text-accent">{status}</p> : null}
          </div>
        )}
      </section>
    </div>
  )
}
