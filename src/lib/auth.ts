import { useSyncExternalStore } from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
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
    name: user.displayName || user.email || "Аккаунт",
    picture: user.photoURL || "",
    verified: user.emailVerified,
  };
}
export function authError(error: unknown): string {
  const code = (error as { code?: string })?.code || "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Неверная почта или пароль.",
    "auth/wrong-password": "Неверная почта или пароль.",
    "auth/user-not-found": "Неверная почта или пароль.",
    "auth/invalid-email": "Проверь адрес электронной почты.",
    "auth/email-already-in-use":
      "Эта почта уже зарегистрирована. Войди или восстанови пароль.",
    "auth/weak-password": "Используй пароль не короче 8 символов.",
    "auth/too-many-requests": "Слишком много попыток. Попробуй позже.",
    "auth/network-request-failed":
      "Нет связи. Проверь интернет и повтори попытку.",
    "auth/popup-closed-by-user": "Вход отменён. Можно попробовать снова.",
    "auth/cancelled-popup-request": "Окно входа уже открыто.",
    "auth/popup-blocked":
      "Разреши всплывающее окно для входа Google или войди по почте.",
    "auth/unauthorized-domain":
      "Вход с этого адреса пока не настроен. Попробуй другой способ входа.",
    "auth/account-exists-with-different-credential":
      "Войди способом, которым зарегистрировал эту почту.",
    "auth/user-disabled": "Этот аккаунт отключён.",
    "auth/operation-not-allowed": "Этот способ входа пока недоступен.",
  };
  return messages[code] || "Не удалось выполнить действие. Повтори попытку.";
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
      error: "Аккаунт создан. Имя не сохранилось; вход доступен.",
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
export async function signOutAccount() {
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
