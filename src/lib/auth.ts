import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { firebaseAuth, googleProvider } from './firebase'

export type Account = {
  sub: string
  email: string
  name: string
  picture: string
}

const ACCOUNT_KEY = 'umbra.account'
const listeners = new Set<() => void>()

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
    return raw ? JSON.parse(raw) as Account : null
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

export function cloudUid() {
  return firebaseAuth.currentUser?.uid || null
}

function isiOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function listenAuth() {
  getRedirectResult(firebaseAuth)
    .then((result) => {
      if (result?.user) saveAccount(accountFromUser(result.user))
    })
    .catch(() => undefined)
  return onAuthStateChanged(firebaseAuth, (user) => {
    if (user) saveAccount(accountFromUser(user))
    emit()
  })
}

export async function signInWithGoogle() {
  if (isiOS()) {
    await signInWithRedirect(firebaseAuth, googleProvider)
    return
  }
  const result = await signInWithPopup(firebaseAuth, googleProvider)
  saveAccount(accountFromUser(result.user))
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
  saveAccount(accountFromUser(result.user))
}

export async function registerWithEmail(email: string, password: string, name: string) {
  const result = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password)
  const label = name.trim() || email.trim()
  await updateProfile(result.user, { displayName: label }).catch(() => undefined)
  saveAccount({
    ...accountFromUser(result.user),
    name: label,
  })
}

export async function signOutAccount() {
  await firebaseSignOut(firebaseAuth).catch(() => undefined)
  saveAccount(null)
}
