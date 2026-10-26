import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MediaType } from "./lib/tmdb";
import { useAuth, cloudUid } from "./lib/auth";
import {
  dropItem,
  watchLibrary,
  pushItem,
  patchItem,
  importItems,
} from "./lib/cloud";
import {
  parseImport,
  parseItem,
  type LibraryItem,
  type LibraryPatch,
} from "./lib/library";
import { readStorage, writeStorage } from "./lib/storage";
import { usePublishProfile, useShareWithFriends } from "./lib/friends";
export type { LibraryItem, Status } from "./lib/library";
export type Settings = {
  region: string;
  subscribed: number[];
};
export type SyncState =
  "signed-out" | "connecting" | "synced" | "pending" | "offline" | "error";
const defaults: Settings = {
  region: "UA",
  subscribed: [8, 337, 9, 1899, 350, 192],
};
function loadSettings(): Settings {
  try {
    const v = JSON.parse(readStorage("umbra.settings") || "{}");
    return {
      region: ["UA", "US", "GB", "DE", "PL"].includes(v.region)
        ? v.region
        : "UA",
      subscribed: Array.isArray(v.subscribed)
        ? v.subscribed.filter((id: unknown) => Number.isSafeInteger(id))
        : defaults.subscribed,
    };
  } catch {
    return defaults;
  }
}
type Ctx = {
  uid: string | null;
  libraryReady: boolean;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  items: LibraryItem[];
  sync: SyncState;
  syncError: string | null;
  retrySync: () => void;
  upsert: (
    item: Omit<LibraryItem, "updatedAt"> & { updatedAt?: number },
  ) => void;
  update: (type: MediaType, id: number, patch: LibraryPatch) => void;
  remove: (type: MediaType, id: number) => void;
  get: (type: MediaType, id: number) => LibraryItem | undefined;
  exportJson: () => string;
  importJson: (raw: string) => Promise<void>;
};
const AppState = createContext<Ctx | null>(null);
export function AppStateProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const uid = auth.account?.sub || null;
  const [session, setSession] = useState<{
    lastUid: string | null;
    epoch: number;
  }>({ lastUid: uid, epoch: 0 });
  if (session.lastUid !== uid) {
    const switchedFromUser = session.lastUid !== null;
    setSession({
      lastUid: uid,
      epoch: switchedFromUser ? session.epoch + 1 : session.epoch,
    });
  }
  // Keyed epoch tears down the tree when leaving an authenticated session
  // (preventing even a single render of A's data in B's session) while
  // avoiding a full remount during initial auth restoration (null -> uid).
  return (
    <SessionState
      key={session.epoch}
      uid={uid}
      name={auth.account?.name || ""}
      picture={auth.account?.picture || ""}
    >
      {children}
    </SessionState>
  );
}
function SessionState({
  uid,
  name,
  picture,
  children,
}: {
  uid: string | null;
  name: string;
  picture: string;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState(loadSettings);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [readyForUid, setReadyForUid] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>(
    uid ? "connecting" : "signed-out",
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [attempt, retry] = useState(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!writeStorage("umbra.settings", JSON.stringify(settings)))
      setSyncError("Настройки не сохраняются на этом устройстве.");
    // Older releases kept a copy of the TMDB key on the device; drop it.
    writeStorage("umbra.tmdbKey", null);
  }, [settings]);
  useEffect(() => {
    if (!uid) {
      setItems([]);
      setSync("signed-out");
      setSyncError(null);
      return;
    }
    let alive = true;
    let pending = false;
    let cached = true;
    let failed = false;
    let markedReady = false;
    const markReady = () => {
      if (!alive || markedReady) return;
      markedReady = true;
      window.clearTimeout(fallbackTimer);
      setReadyForUid(uid);
    };
    const fallbackTimer = window.setTimeout(markReady, 500);
    const status = () => {
      if (!alive || failed) return;
      setSync(
        !navigator.onLine
          ? "offline"
          : pending
            ? "pending"
            : cached
              ? "connecting"
              : "synced",
      );
    };
    setSync("connecting");
    setSyncError(null);
    const stop = watchLibrary(
      uid,
      (next, hasPending, fromCache) => {
        if (!alive) return;
        setItems(next);
        pending = hasPending;
        cached = fromCache;
        status();
        if (next.length > 0 || !fromCache || !navigator.onLine) markReady();
      },
      (error) => {
        if (!alive) return;
        failed = true;
        markReady();
        setSync("error");
        setSyncError(
          error.message.includes("permission")
            ? "Облако отклонило доступ. Войди снова или обратись к владельцу приложения."
            : "Не удалось прочитать полку. Проверь сеть и повтори попытку.",
        );
      },
    );
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    return () => {
      alive = false;
      window.clearTimeout(fallbackTimer);
      stop();
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
    };
  }, [uid, attempt]);
  usePublishProfile(uid, name, picture);
  useShareWithFriends(uid, items);
  function owner() {
    if (!uid || cloudUid() !== uid)
      throw new Error("Войди в аккаунт, чтобы сохранить фильм.");
    return uid;
  }
  function mutation(action: () => Promise<void>) {
    setSyncError(null);
    setSync(navigator.onLine ? "pending" : "offline");
    try {
      void action().catch((error) => {
        if (!active.current) return;
        setSync("error");
        setSyncError(
          (error as { code?: string }).code === "not-found"
            ? "Этот фильм уже удалён на другом устройстве. Добавь его снова, если нужно."
            : "Изменение не сохранилось в облаке. Повтори действие; при необходимости экспортируй полку.",
        );
      });
    } catch (error) {
      setSync("error");
      setSyncError((error as Error).message);
    }
  }
  const libraryReady = !uid || readyForUid === uid;
  const value: Ctx = {
    uid,
    libraryReady,
    settings,
    setSettings: (patch) => setSettings((s) => ({ ...s, ...patch })),
    items,
    sync,
    syncError,
    retrySync: () => retry((n) => n + 1),
    upsert: (item) =>
      mutation(() =>
        pushItem(owner(), parseItem({ ...item, updatedAt: Date.now() })),
      ),
    update: (type, id, patch) =>
      mutation(() => {
        const previous = items.find(
          (item) => item.id === id && item.type === type,
        );
        if (!previous) throw new Error("Фильм отсутствует на полке.");
        parseItem({ ...previous, ...patch });
        return patchItem(owner(), type, id, patch);
      }),
    remove: (type, id) => mutation(() => dropItem(owner(), type, id)),
    get: (type, id) =>
      items.find((item) => item.type === type && item.id === id),
    exportJson: () => JSON.stringify({ version: 1, items }, null, 2),
    importJson: async (raw) => {
      const parsed = parseImport(raw);
      const id = owner();
      setSyncError(null);
      setSync("pending");
      try {
        await importItems(id, parsed);
      } catch {
        if (active.current) {
          setSync("error");
          setSyncError(
            "Импорт завершился не полностью. Уже сохранённые записи остаются; файл можно импортировать повторно.",
          );
        }
        throw new Error(
          "Не удалось завершить импорт. Проверь соединение и повтори попытку.",
        );
      }
    },
  };
  return <AppState.Provider value={value}>{children}</AppState.Provider>;
}
export function useAppState() {
  const ctx = useContext(AppState);
  if (!ctx) throw new Error("AppState missing");
  return ctx;
}
