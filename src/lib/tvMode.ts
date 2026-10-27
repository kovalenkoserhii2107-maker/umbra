/**
 * TV mode: the Android TV app opens the site with ?tv=1. The flag is kept for
 * the session so links inside the app keep it; ?tv=0 turns it off.
 * The app also exposes window.UmbraTV (android-tv/…/TvBridge.kt).
 */

import { defaultFocus, startSpatialNav } from "./spatial";

const KEY = "umbra.tv";

type Session = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function detectTvMode(
  search: string,
  session: Session | null,
  userAgent = "",
): boolean {
  const flag = new URLSearchParams(search).get("tv");
  try {
    if (flag === "1") session?.setItem(KEY, "1");
    if (flag === "0") session?.removeItem(KEY);
    if (flag === "0") return false;
    return (
      flag === "1" ||
      session?.getItem(KEY) === "1" ||
      / UmbraTV\//.test(userAgent)
    );
  } catch {
    return flag === "1" || / UmbraTV\//.test(userAgent);
  }
}

function sessionStore(): Session | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const isTv =
  typeof window !== "undefined" &&
  detectTvMode(window.location.search, sessionStore(), navigator.userAgent);

/** html.tv, arrows and OK, and the remote's Back for the app. */
export function enableTvMode() {
  if (!isTv) return;
  document.documentElement.classList.add("tv");
  startSpatialNav();
  (window as unknown as { umbraTvBack: () => boolean }).umbraTvBack = () =>
    handleTvBack() || backToTop() || (rootBack?.() ?? false);
}

/** Back on a home screen scrolled down returns to its top before leaving. */
function backToTop() {
  const home = ["", "#", "#/", "#/games"].includes(window.location.hash);
  if (!home || window.scrollY < 100) return false;
  defaultFocus(0)?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
  return true;
}

/** Streaming apps the TV app knows how to open (ExternalLinks.kt). */
export type TvApp =
  "youtube" | "netflix" | "prime" | "apple" | "disney" | "max" | "megogo";

type Bridge = {
  version(): string;
  installedApps(): string;
  openExternal(url: string): void;
  launchApp(slug: string, query: string): void;
  voiceAvailable(): boolean;
  startVoice(language: string): void;
  /** Since the sign-in update of the app; older versions lack it. */
  googleSignIn?(): void;
  /** Closes the app (Back twice on «Стрічка»); older versions lack it. */
  exitApp?(): void;
  /** Since «На телевізорі в Lampa»: JSON of TvRemoteInfo. */
  remoteInfo?(): string;
  stopVoice(): void;
};

export function tvBridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { UmbraTV?: Bridge }).UmbraTV ?? null;
}

/** Installed apps; `lampa` is reported by app versions that know it. */
type Installed = Partial<Record<TvApp | "lampa", boolean>>;

let installed: Installed | null = null;

export function installedApps(): Installed {
  if (installed) return installed;
  try {
    installed = JSON.parse(tvBridge()?.installedApps() ?? "{}");
  } catch {
    installed = {};
  }
  return installed!;
}

export function canVoice() {
  try {
    return Boolean(tvBridge()?.voiceAvailable());
  } catch {
    return false;
  }
}

/** A link for the TV: through the app (YouTube, Netflix…), else a new tab. */
export function openOnTv(url: string) {
  const bridge = tvBridge();
  if (bridge) bridge.openExternal(url);
  else window.open(url, "_blank", "noopener");
}

/**
 * Lampa (top.rootu.lampa) opens a title's card by its TMDB address; the
 * intent sends it to Lampa alone, not to a browser.
 */
export function lampaLink(type: "movie" | "tv", id: number) {
  return `intent://www.themoviedb.org/${type}/${id}#Intent;scheme=https;action=android.intent.action.VIEW;package=top.rootu.lampa;end`;
}

/** On a TV with Lampa; app versions that do not report it are given a try. */
export function hasLampa() {
  return Boolean(tvBridge()) && installedApps().lampa !== false;
}

export function openInLampa(type: "movie" | "tv", id: number) {
  openOnTv(lampaLink(type, id));
}

export function playTrailer(youtubeKey: string) {
  openOnTv(`https://www.youtube.com/watch?v=${youtubeKey}`);
}

export function launchTvApp(app: TvApp, title: string) {
  tvBridge()?.launchApp(app, title);
}

/** Events from the app: voice input, Google sign-in, the push token. */
export type TvEvent =
  | {
      type: "voice";
      state: "listening" | "partial" | "result" | "error" | "end";
      text: string;
    }
  | {
      /** The push token is ready: the TV can be registered for the phone. */
      type: "remote";
      state: "token";
      text: string;
    }
  | {
      type: "google";
      /** token: `text` is a Google ID token; error: cancelled, no_account, failed. */
      state: "token" | "error";
      text: string;
    };

/** Sign in with the Google account of the TV (the app's account picker). */
export function canGoogleOnTv() {
  return typeof tvBridge()?.googleSignIn === "function";
}

export function startGoogleOnTv() {
  tvBridge()?.googleSignIn?.();
}

/** "BRAVIA 4K VH21" from the WebView's user agent, for the phone to show. */
export function tvDeviceName(userAgent: string) {
  const model = userAgent.match(
    /Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/,
  )?.[1];
  return model && model !== "K" ? model.trim() : "Телевізор";
}

export function onTvEvent(listener: (event: TvEvent) => void) {
  const handler = (e: Event) => listener((e as CustomEvent<TvEvent>).detail);
  window.addEventListener("umbratv", handler);
  return () => window.removeEventListener("umbratv", handler);
}

// ---- Remote "Back" ----

/**
 * The app asks window.umbraTvBack() before going back in history: open
 * panels close first. Handlers are a stack — the last opened closes first.
 */
const backStack: Array<() => void> = [];

export function pushTvBack(handler: () => void) {
  backStack.push(handler);
  return () => {
    const i = backStack.lastIndexOf(handler);
    if (i >= 0) backStack.splice(i, 1);
  };
}

/**
 * What Back does when nothing on the screen is open (set by the TV app's
 * shell): another tab → «Стрічка»; «Стрічка» → twice quickly to leave.
 * true — handled; false — the app goes back in history or closes.
 */
let rootBack: (() => boolean) | null = null;

export function setTvRootBack(handler: (() => boolean) | null) {
  rootBack = handler;
}

/** Leaves the TV app; false when this version of the app cannot. */
export function exitTvApp() {
  const bridge = tvBridge();
  if (!bridge?.exitApp) return false;
  bridge.exitApp();
  return true;
}

export function handleTvBack(): boolean {
  const top = backStack[backStack.length - 1];
  if (top) {
    top();
    return true;
  }
  return false;
}

// ---- "Дивитися": streaming apps on this TV ----

type Provider = { provider_id: number; provider_name: string };
type Offers = Partial<
  Record<"flatrate" | "free" | "ads" | "rent" | "buy", Provider[]>
>;

const APP_NAMES: Array<[RegExp, TvApp]> = [
  [/netflix/, "netflix"],
  [/prime video|amazon video/, "prime"],
  [/disney/, "disney"],
  [/^max$|hbo max/, "max"],
  [/apple tv/, "apple"],
  [/megogo/, "megogo"],
  [/youtube/, "youtube"],
];

export function appForProvider(name: string): TvApp | null {
  const n = name.toLowerCase().trim();
  return APP_NAMES.find(([re]) => re.test(n))?.[1] ?? null;
}

const OFFER_LABELS = [
  ["flatrate", "за передплатою"],
  ["free", "безкоштовно"],
  ["ads", "безкоштовно з рекламою"],
  ["rent", "оренда"],
  ["buy", "купівля"],
] as const;

export type WatchApp = { app: TvApp; name: string; offer: string };

/** Apps from the region's offers that are installed, subscriptions first. */
export function watchApps(
  offers: Offers | undefined,
  installed: Partial<Record<TvApp, boolean>>,
): WatchApp[] {
  const list: WatchApp[] = [];
  for (const [kind, offer] of OFFER_LABELS) {
    for (const p of offers?.[kind] ?? []) {
      const app = appForProvider(p.provider_name);
      if (!app || !installed[app] || list.some((x) => x.app === app)) continue;
      list.push({ app, name: p.provider_name, offer });
    }
  }
  return list;
}
