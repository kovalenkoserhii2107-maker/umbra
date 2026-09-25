export type Account = {
  sub: string
  email: string
  name: string
  picture: string
}

const ACCOUNT_KEY = 'umbra.account'
const CLIENT_KEY = 'umbra.googleClientId'
const listeners = new Set<() => void>()

export function getGoogleClientId() {
  return localStorage.getItem(CLIENT_KEY)?.trim() || ''
}

export function setGoogleClientId(id: string) {
  const value = id.trim()
  if (value) localStorage.setItem(CLIENT_KEY, value)
  else localStorage.removeItem(CLIENT_KEY)
  emit()
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
  return () => listeners.delete(fn)
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
