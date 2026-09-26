import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth'
import { firebaseAuth, googleProvider } from './firebase'

export type Account = {
  sub: string
  email: string
  name: string
  picture: string
}

export const GOOGLE_CLIENT_ID = '930734450482-332dtsopro9cql4c7m3l3jdbcpjd274.apps.googleusercontent.com'

const ACCOUNT_KEY = 'umbra.account'
const listeners = new Set<() => void>()

function repairText(value: string) {
  if (!value) return value
  if (!/[\u00C0-\u00FF]/.test(value)) return value
  try {
    return new TextDecoder('utf-8').decode(Uint8Array.from(value, (ch) => ch.charCodeAt(0) & 0xff))
  } catch {
    return value
  }
}

function accountFromUser(user: User): Account {
  return {
    sub: user.uid,
    email: user.email || '',
    name: user.displayName || user.email || 'Аккаунт',
    picture: user.photoURL || '',
  }
}

export function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Account
    return { ...parsed, name: repairText(parsed.name || ''), email: repairText(parsed.email || '') }
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

export function cloudUid() {
  return firebaseAuth.currentUser?.uid || null
}

export function listenAuth() {
  getRedirectResult(firebaseAuth).catch(() => undefined)
  return onAuthStateChanged(firebaseAuth, (user) => {
    if (user) saveAccount(accountFromUser(user))
    emit()
  })
}

export async function signInWithGoogleToken(idToken: string) {
  const local = parseCredential(idToken)
  saveAccount(local)
  const result = await signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(idToken))
  saveAccount(accountFromUser(result.user))
}

export async function connectFirebase() {
  const result = await signInWithPopup(firebaseAuth, googleProvider)
  saveAccount(accountFromUser(result.user))
  return result.user.uid
}

export async function signOutAccount() {
  await firebaseSignOut(firebaseAuth).catch(() => undefined)
  saveAccount(null)
}
