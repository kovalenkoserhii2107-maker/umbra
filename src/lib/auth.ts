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

export function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    return raw ? (JSON.parse(raw) as Account) : null
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

export function parseCredential(credential: string): Account {
  const payload = credential.split('.')[1]
  if (!payload) throw new Error('BAD_TOKEN')
  const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
    sub?: string
    email?: string
    name?: string
    picture?: string
  }
  if (!json.sub || !json.email) throw new Error('BAD_TOKEN')
  return {
    sub: json.sub,
    email: json.email,
    name: json.name || json.email,
    picture: json.picture || '',
  }
}
