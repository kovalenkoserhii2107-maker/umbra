import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'
import { GOOGLE_CLIENT_ID, signInWithGoogleToken } from '../lib/auth'

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

export function GoogleSignIn({ next = '/cabinet' }: { next?: string }) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let gone = false
    loadGsi()
      .then(() => {
        if (gone || !buttonRef.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: 'popup',
          callback: async (res) => {
            try {
              if (!res.credential) throw new Error('NO_CRED')
              try {
                await signInWithGoogleToken(res.credential)
              } catch (err) {
                const code = err instanceof FirebaseError ? err.code : ''
                setStatus(code ? `Профиль открыт, облако: ${code}` : 'Профиль открыт, облако пока без Firebase')
              }
              navigate(next, { replace: true })
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
  }, [navigate, next])

  return (
    <div className="space-y-3">
      <div ref={buttonRef} className="flex min-h-10 justify-center" />
      {status ? <p className="text-center text-sm text-accent">{status}</p> : null}
    </div>
  )
}
