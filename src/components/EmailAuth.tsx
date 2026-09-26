import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'
import { registerWithEmail, signInWithEmail } from '../lib/auth'

function explain(err: unknown) {
  const code = err instanceof FirebaseError ? err.code : ''
  if (code.includes('email-already-in-use')) return 'Эта почта уже зарегистрирована. Войди с паролем.'
  if (code.includes('invalid-email')) return 'Некорректный email'
  if (code.includes('weak-password')) return 'Пароль от 6 символов'
  if (code.includes('user-not-found') || code.includes('invalid-credential') || code.includes('wrong-password')) return 'Неверная почта или пароль'
  if (code.includes('operation-not-allowed')) return 'В Firebase включи Email/Password в Sign-in method'
  if (code.includes('too-many-requests')) return 'Слишком много попыток. Подожди минуту'
  return code ? `Ошибка: ${code}` : 'Не удалось войти'
}

export function EmailAuth({ next = '/cabinet' }: { next?: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    try {
      if (mode === 'register') await registerWithEmail(email, password, name)
      else await signInWithEmail(email, password)
      navigate(next, { replace: true })
    } catch (err) {
      setStatus(explain(err))
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-2xl border border-hairline bg-canvas px-4 py-3 text-sm outline-none focus:border-accent'

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      {mode === 'register' ? (
        <input className={field} placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      ) : null}
      <input className={field} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      <input className={field} type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={6} required />
      <button type="submit" disabled={busy} className="w-full rounded-full border border-hairline px-4 py-3 text-sm disabled:opacity-60">
        {busy ? 'Проверяю…' : mode === 'register' ? 'Создать аккаунт' : 'Войти по почте'}
      </button>
      <button
        type="button"
        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setStatus('') }}
        className="w-full text-center text-xs text-mute"
      >
        {mode === 'login' ? 'Нет аккаунта — зарегистрироваться' : 'Уже есть аккаунт — войти'}
      </button>
      {status ? <p className="text-center text-sm text-accent">{status}</p> : null}
    </form>
  )
}
