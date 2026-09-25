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
  const [iosHelp, setIosHelp] = useState(false)

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
    }, 900)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.clearTimeout(timer)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setOpen(false)
    setIosHelp(false)
  }

  async function install() {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') dismiss()
      else setOpen(false)
      return
    }
    if (isIos()) {
      setIosHelp(true)
      return
    }
    setIosHelp(true)
  }

  if (!open || isStandalone()) return null

  return (
    <div className="fixed inset-x-0 bottom-[4.5rem] z-50 px-4 md:bottom-6">
      <div className="rise mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-hairline bg-card/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Установить Umbra</p>
          {iosHelp ? (
            <p className="mt-0.5 text-xs leading-5 text-mute">
              {isIos()
                ? 'Нажми «Поделиться», затем «На экран Домой».'
                : 'В меню браузера выбери «Установить приложение» или «Добавить на рабочий стол».'}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-mute">На телефон или рабочий стол — как обычное приложение.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
          <button onClick={dismiss} className="rounded-full px-3 py-1.5 text-xs text-dim">Позже</button>
          <button onClick={install} className="rounded-full bg-ink px-3 py-1.5 text-xs text-canvas">
            Установить
          </button>
        </div>
      </div>
    </div>
  )
}
