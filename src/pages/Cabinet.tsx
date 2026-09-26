import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { FirebaseError } from 'firebase/app'
import { cloudUid, connectFirebase, loadAccount, signOutAccount, subscribeAccount } from '../lib/auth'
import { useAppState } from '../state'

export function CabinetPage() {
  const [account, setAccount] = useState(() => loadAccount())
  const [cloud, setCloud] = useState(() => cloudUid())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const { items } = useAppState()

  useEffect(() => subscribeAccount(() => {
    setAccount(loadAccount())
    setCloud(cloudUid())
  }), [])

  if (!account) return <Navigate to="/login" replace />

  async function linkCloud() {
    setBusy(true)
    setNote('')
    try {
      const uid = await connectFirebase()
      setCloud(uid)
      setNote('Облако подключено')
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : ''
      setNote(code || 'Не удалось открыть окно Google')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rise max-w-2xl space-y-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">кабинет</p>
        <h1 className="mt-1 text-3xl tracking-tight">Мой профиль</h1>
      </div>
      <section className="rounded-2xl border border-hairline bg-card p-5">
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
          <button onClick={() => signOutAccount()} className="rounded-full border border-hairline px-3 py-1.5 text-xs text-mute">
            Выйти
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">облако</p>
        <p className="mt-2 text-sm text-mute">
          {cloud
            ? `Полка синхронизируется · ${items.length} титлов`
            : 'Сейчас полка только на этом телефоне. Подключи Firebase, чтобы она появилась в базе.'}
        </p>
        {!cloud ? (
          <button
            onClick={linkCloud}
            disabled={busy}
            className="mt-4 rounded-full border border-hairline px-4 py-2 text-sm disabled:opacity-60"
          >
            {busy ? 'Открываю Google…' : 'Подключить облако'}
          </button>
        ) : null}
        {note ? <p className="mt-3 text-sm text-accent">{note}</p> : null}
      </section>
    </div>
  )
}
