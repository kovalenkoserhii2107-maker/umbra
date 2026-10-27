import { useSyncExternalStore } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithCredential,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { firebaseAuth, googleProvider } from "./firebase";
import { writeStorage } from "./storage";

export type Account = {
  sub: string;
  email: string;
  name: string;
  picture: string;
  verified: boolean;
};
export type AuthState = {
  status: "initializing" | "authenticated" | "anonymous" | "error";
  account: Account | null;
  error: string | null;
};
let snapshot: AuthState = {
  status: "initializing",
  account: null,
  error: null,
};
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
function publish(next: AuthState) {
  snapshot = next;
  listeners.forEach((fn) => fn());
}
export function accountFromUser(user: User): Account {
  return {
    sub: user.uid,
    email: user.email || "",
    name: user.displayName || user.email || "Акаунт",
    picture: user.photoURL || "",
    verified: user.emailVerified,
  };
}
export function authError(error: unknown): string {
  const code = (error as { code?: string })?.code || "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Невірна пошта або пароль.",
    "auth/wrong-password": "Невірна пошта або пароль.",
    "auth/user-not-found": "Невірна пошта або пароль.",
    "auth/invalid-email": "Перевір адресу електронної пошти.",
    "auth/email-already-in-use":
      "Ця пошта вже зареєстрована. Увійди або віднови пароль.",
    "auth/weak-password": "Використовуй пароль не коротший за 8 символів.",
    "auth/too-many-requests": "Забагато спроб. Спробуй пізніше.",
    "auth/network-request-failed":
      "Немає зв'язку. Перевір інтернет і повтори спробу.",
    "auth/popup-closed-by-user": "Вхід скасовано. Можна спробувати знову.",
    "auth/cancelled-popup-request": "Вікно входу вже відкрито.",
    "auth/popup-blocked":
      "Дозволь спливаюче вікно для входу Google або увійди за поштою.",
    "auth/unauthorized-domain":
      "Вхід із цієї адреси поки не налаштовано. Спробуй інший спосіб входу.",
    "auth/account-exists-with-different-credential":
      "Увійди способом, яким реєстрував цю пошту.",
    "auth/user-disabled": "Цей акаунт вимкнено.",
    "auth/operation-not-allowed": "Цей спосіб входу поки недоступний.",
  };
  return messages[code] || "Не вдалося виконати дію. Повтори спробу.";
}
export function listenAuth() {
  if (stop) return stop;
  // The old profile was only a UI cache, never proof of a Firebase session.
  writeStorage("umbra.account", null);
  stop = onAuthStateChanged(
    firebaseAuth,
    (user) => {
      publish({
        status: user ? "authenticated" : "anonymous",
        account: user ? accountFromUser(user) : null,
        error: null,
      });
    },
    (error) =>
      publish({ status: "error", account: null, error: authError(error) }),
  );
  // Complete redirects initiated by older releases; new Google sign-ins use popup.
  getRedirectResult(firebaseAuth).catch((error) =>
    publish({ ...snapshot, error: authError(error) }),
  );
  return stop;
}
export function subscribeAccount(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function loadAccount() {
  return snapshot.account;
}
export function useAuth() {
  return useSyncExternalStore(subscribeAccount, () => snapshot);
}
export function cloudUid() {
  return firebaseAuth.currentUser?.uid || null;
}
export async function signInWithGoogle() {
  await signInWithPopup(firebaseAuth, googleProvider);
}
/** TV app: a Google ID token from the account chosen on the TV. */
export async function signInWithGoogleToken(token: string) {
  await signInWithCredential(
    firebaseAuth,
    GoogleAuthProvider.credential(token),
  );
}
/** TV app: the one-time token the phone approved (worker /tv/token). */
export async function signInWithTvToken(token: string) {
  await signInWithCustomToken(firebaseAuth, token);
}
export async function signInWithEmail(email: string, password: string) {
  await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
}
export async function registerWithEmail(
  email: string,
  password: string,
  name: string,
) {
  const { user } = await createUserWithEmailAndPassword(
    firebaseAuth,
    email.trim(),
    password,
  );
  try {
    await updateProfile(user, {
      displayName: name.trim().slice(0, 100) || email.trim(),
    });
    if (firebaseAuth.currentUser?.uid === user.uid)
      publish({
        status: "authenticated",
        account: accountFromUser(user),
        error: null,
      });
  } catch {
    publish({
      ...snapshot,
      error: "Акаунт створено. Ім'я не збереглося; вхід доступний.",
    });
  }
}
export async function resetPassword(email: string) {
  await sendPasswordResetEmail(firebaseAuth, email.trim());
}
export async function verifyEmail() {
  if (firebaseAuth.currentUser)
    await sendEmailVerification(firebaseAuth.currentUser);
}
const beforeSignOut = new Set<() => Promise<void> | void>();
export function onBeforeSignOut(fn: () => Promise<void> | void) {
  beforeSignOut.add(fn);
  return () => {
    beforeSignOut.delete(fn);
  };
}
export async function signOutAccount() {
  if (beforeSignOut.size)
    await Promise.race([
      Promise.allSettled(
        [...beforeSignOut].map((fn) => Promise.resolve().then(fn)),
      ),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  await signOut(firebaseAuth);
}
export function safeReturnPath(value: string | null) {
  return value &&
    /^\/(?!\/)/.test(value) &&
    !value.includes("\\") &&
    !value.startsWith("/login")
    ? value
    : "/";
}
/** A fresh Firebase ID token for calls that the API worker checks. */
export async function idToken() {
  const user = firebaseAuth.currentUser;
  return user ? user.getIdToken() : null;
}
