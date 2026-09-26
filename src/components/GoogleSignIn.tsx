import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'
import { signInWithGoogle } from '../lib/auth'

function explain(err: unknown) {
  const code = err instanceof FirebaseError ? err.code : ''
  if (code.includes('unauthorized-domain')) return 'Добавь домен kovalenkoserhii2107-maker.github.io в Authentication → Settings → Authorized domains'
  if (code.includes('operation-not-allowed')) return 'В Firebase не включён вход через Google'
  if (code.includes('popup-blocked') || code.includes('popup-closed')) return 'Окно Google закрылось. Нажми ещё раз'
  if (code.includes('network-request-failed')) return 'Нет сети до Firebase'
  return code ? `Ошибка входа: ${code}` : 'Не удалось войти через Google'
}

export function GoogleSignIn({ next = '/cabinet' }: { next?: string }) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function enter() {
    setBusy(true)
    setStatus('')
    try {
      await signInWithGoogle()
      navigate(next, { replace: true })
    } catch (err) {
      setStatus(explain(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={enter}
        disabled={busy}
        className="w-full rounded-full border border-hairline bg-ink px-4 py-3 text-sm text-canvas disabled:opacity-60"
      >
        {busy ? 'Открываю Google…' : 'Войти через Google'}
      </button>
      {status ? <p className="text-center text-sm text-accent">{status}</p> : null}
    </div>
  )
}
