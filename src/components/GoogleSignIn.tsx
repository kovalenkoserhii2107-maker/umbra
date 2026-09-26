import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithGoogle } from '../lib/auth'

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
      const code = err instanceof Error ? err.message : ''
      if (code.includes('popup-closed') || code.includes('cancelled')) setStatus('Вход отменён')
      else setStatus('Не удалось войти через Google. Проверь, что в Firebase включен Google и добавлен домен github.io')
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
        {busy ? 'Вход…' : 'Войти через Google'}
      </button>
      {status ? <p className="text-center text-sm text-accent">{status}</p> : null}
    </div>
  )
}
