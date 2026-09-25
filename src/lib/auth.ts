export type Account = {
  sub: string
  email: string
  name: string
  picture: string
}

export const GOOGLE_CLIENT_ID = '199998842717-pfe821bnk7cjp3rnhfaj1r7k67eo55l8.apps.googleusercontent.com'

const ACCOUNT_KEY = 'umbra.account'
const listeners = new Set<() => void>()

export function getGoogleClientId() {
  return GOOGLE_CLIENT_ID
}

function repairText(value: string) {
  if (!value) return value
  if (!/[\u00C0-\u00FF]/.test(value)) return value
  try {
    return new TextDecoder('utf-8').decode(Uint8Array.from(value, (ch) => ch.charCodeAt(0) & 0xff))
  } catch {
    return value
  }
}

export function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Account
    const fixed: Account = {
      ...parsed,
      name: repairText(parsed.name || ''),
      email: repairText(parsed.email || ''),
    }
    if (fixed.name !== parsed.name) saveAccount(fixed)
    return fixed
  } catch {
    return null
  }
}

export function saveAccount(account: Account | null) {
  if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  else localStorage.removeItem(ACCOUNT_KEY)
  emit()
}

export function subscribeAccount(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function emit() {
  listeners.forEach((fn) => fn())
}

function decodeJwtJson(credential: string) {
  const payload = credential.split('.')[1]
  if (!payload) throw new Error('BAD_TOKEN')
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const bytes = Uint8Array.from(atob(b64 + pad), (ch) => ch.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as {
    sub?: string
    email?: string
    name?: string
    picture?: string
  }
}

export function parseCredential(credential: string): Account {
  const json = decodeJwtJson(credential)
  if (!json.sub || !json.email) throw new Error('BAD_TOKEN')
  return {
    sub: json.sub,
    email: json.email,
    name: json.name || json.email,
    picture: json.picture || '',
  }
}
