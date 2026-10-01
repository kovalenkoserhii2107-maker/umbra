import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "./storage";

/**
 * Chrome fires `beforeinstallprompt` once per page load, when it decides the
 * app may be installed — often while a new person is still on the sign-in
 * screen. Listening here, at startup, keeps that event for the prompt shown
 * after sign-in.
 */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "umbra.installDismissed";
/** After "Позже" the prompt returns once, a week later, then stays away. */
export const REMIND_AFTER = 7 * 86400_000;
const MAX_DISMISSALS = 2;

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function isStandalone() {
  return (
    installed ||
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function isIos() {
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function listenInstall() {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep Chrome's own mini-infobar away; Umbra shows its prompt after sign-in.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
}

type Dismissal = { at: number; count: number };

export function parseDismissal(raw: string | null): Dismissal | null {
  if (!raw) return null;
  // Older releases stored "1" with no date: ask once more.
  if (raw === "1") return { at: 0, count: 1 };
  try {
    const v = JSON.parse(raw) as Dismissal;
    return typeof v.at === "number" && typeof v.count === "number" ? v : null;
  } catch {
    return null;
  }
}

/** Whether the prompt may open by itself (the menu item always works). */
export function mayRemind(raw: string | null, now = Date.now()) {
  const d = parseDismissal(raw);
  if (!d) return true;
  return d.count < MAX_DISMISSALS && now - d.at >= REMIND_AFTER;
}

export function shouldAutoOpen() {
  return !isStandalone() && mayRemind(readStorage(DISMISS_KEY));
}

export function rememberDismissal() {
  const d = parseDismissal(readStorage(DISMISS_KEY));
  writeStorage(
    DISMISS_KEY,
    JSON.stringify({ at: Date.now(), count: (d?.count || 0) + 1 }),
  );
}

export function forgetDismissal() {
  writeStorage(DISMISS_KEY, null);
}

/** Opens the system install dialog; null when the browser has not offered it. */
export async function promptInstall() {
  const event = deferred;
  if (!event) return null;
  deferred = null;
  notify();
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome === "accepted") installed = true;
  notify();
  return choice.outcome;
}

export function openInstallHelp() {
  window.dispatchEvent(new Event("umbra:install-help"));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** True while Chrome lets the app trigger its install dialog. */
export function useCanInstall() {
  return useSyncExternalStore(subscribe, () => deferred !== null);
}

export function useInstalled() {
  return useSyncExternalStore(subscribe, () => isStandalone());
}
