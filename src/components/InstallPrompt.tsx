import { useEffect, useState } from 'react'

const DISMISS_KEY = 'umbra.installDismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

function isIos() {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === '1') return

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
      setOpen(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    const timer = window.setTimeout(() => {
      if (isStandalone() || localStorage.getItem(DISMISS_KEY) === '1') return
      setOpen(true)
    }, 600)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.clearTimeout(timer)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setOpen(false)
  }

  async function install() {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') dismiss()
    }
  }

  if (!open || isStandalone()) return null

  const ios = isIos()

  return (
    <div className="fixed inset-x-0 z-50 px-4" style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}>
      <div className="rise mx-auto max-w-xl rounded-2xl border border-hairline bg-card/95 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <div className="flex items-start gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Установить Umbra</p>
            {ios ? (
              <ol className="mt-2 space-y-1.5 text-xs leading-5 text-mute">
                <li>1. Нажми кнопку «Поделиться» внизу Safari</li>
                <li>2. Выбери «На экран «Домой»»</li>
                <li>3. Подтверди «Добавить»</li>
              </ol>
            ) : (
              <p className="mt-1 text-xs text-mute">На телефон или рабочий стол — как обычное приложение.</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={dismiss} className="rounded-full px-3 py-1.5 text-xs text-dim">Позже</button>
          {ios ? null : (
            <button onClick={install} className="rounded-full bg-ink px-3 py-1.5 text-xs text-canvas">Установить</button>
          )}
        </div>
      </div>
    </div>
  )
}
