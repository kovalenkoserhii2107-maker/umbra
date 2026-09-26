import { Navigate } from 'react-router-dom'
import { BrandLockup } from '../components/Brand'
import { EmailAuth } from '../components/EmailAuth'
import { GoogleSignIn } from '../components/GoogleSignIn'
import { loadAccount } from '../lib/auth'

export function LoginPage() {
  if (loadAccount()) return <Navigate to="/cabinet" replace />

  return (
    <div className="rise mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-2 text-center">
      <BrandLockup size="lg" />
      <h1 className="mt-8 text-3xl tracking-tight">Вход</h1>
      <p className="mt-3 max-w-sm text-sm text-mute">
        Google или почта с паролем. Полка привязывается к аккаунту автоматически.
      </p>
      <div className="mt-8 w-full space-y-5 rounded-2xl border border-hairline bg-card p-6">
        <GoogleSignIn next="/cabinet" />
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-dim">
          <span className="h-px flex-1 bg-hairline" />
          или
          <span className="h-px flex-1 bg-hairline" />
        </div>
        <EmailAuth next="/cabinet" />
      </div>
    </div>
  )
}
