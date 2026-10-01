import { useEffect, useSyncExternalStore } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "./firebase";
import { useAuth } from "./auth";
import {
  mergeSteam,
  parseEntry,
  type GameEntry,
  type SteamPlay,
} from "./gameEntry";
import { steamLibrary, type SteamProfile } from "./api";
import { idsFromSteam, imageUrl, manyGames } from "./igdb";
import { readStorage, writeStorage } from "./storage";

export type SteamLink = {
  steamId: string;
  name: string;
  avatar: string;
  syncedAt: number | null;
};

type State = {
  uid: string | null;
  games: GameEntry[];
  /** The first answer from the server has arrived. */
  ready: boolean;
  error: string | null;
  steam: SteamLink | null;
};

let state: State = {
  uid: null,
  games: [],
  ready: false,
  error: null,
  steam: null,
};
const listeners = new Set<() => void>();
let stops: Array<() => void> = [];

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const millis = (v: unknown) =>
  typeof v === "number"
    ? v
    : ((v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0);

/** Follows the signed-in player's games and Steam link. */
function bind(uid: string | null) {
  if (state.uid === uid) return;
  stops.forEach((stop) => stop());
  stops = [];
  state = { uid, games: [], ready: false, error: null, steam: null };
  listeners.forEach((l) => l());
  if (!uid) return;
  stops.push(
    onSnapshot(
      collection(firebaseDb, "users", uid, "games"),
      { includeMetadataChanges: true },
      (snap) => {
        const games: GameEntry[] = [];
        for (const row of snap.docs) {
          const data = row.data({ serverTimestamps: "estimate" });
          try {
            games.push(
              parseEntry({ ...data, updatedAt: millis(data.updatedAt) }),
            );
          } catch {
            // A damaged entry is skipped instead of hiding the whole collection.
          }
        }
        set({
          games,
          ready: state.ready || !snap.metadata.fromCache,
          error: null,
        });
        if (!snap.metadata.fromCache) void moveLocalGames(uid);
      },
      () => set({ error: "Не удалось загрузить коллекцию игр." }),
    ),
    onSnapshot(
      doc(firebaseDb, "users", uid, "links", "steam"),
      (snap) => {
        const d = snap.data({ serverTimestamps: "estimate" });
        set({
          steam: d
            ? {
                steamId: String(d.steamId),
                name: String(d.name || ""),
                avatar: String(d.avatar || ""),
                syncedAt: d.syncedAt ? millis(d.syncedAt) : null,
              }
            : null,
        });
      },
      () => undefined,
    ),
  );
}

export function useGameCollection() {
  const { account } = useAuth();
  const uid = account?.sub || null;
  useEffect(() => bind(uid), [uid]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

function owner() {
  const uid = state.uid;
  if (!uid || firebaseAuth.currentUser?.uid !== uid)
    throw new Error("Войди в аккаунт, чтобы сохранить игру.");
  return uid;
}

const ref = (uid: string, id: number) =>
  doc(firebaseDb, "users", uid, "games", String(id));

export async function saveGameEntry(entry: Omit<GameEntry, "updatedAt">) {
  const uid = owner();
  const value = parseEntry({ ...entry, updatedAt: 0 });
  const { steam, ...rest } = value;
  await setDoc(ref(uid, value.id), {
    ...rest,
    ...(steam ? { steam } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function removeGameEntry(id: number) {
  await deleteDoc(ref(owner(), id));
}

/* ----------------------------------------------------------- Steam */

export async function linkSteam(profile: SteamProfile) {
  const uid = owner();
  await setDoc(doc(firebaseDb, "users", uid, "links", "steam"), {
    steamId: profile.steamId,
    name: profile.name.slice(0, 100),
    avatar: profile.avatar.slice(0, 2048),
    linkedAt: serverTimestamp(),
  });
}

/** Unlinks the account; imported games stay in the collection. */
export async function unlinkSteam() {
  await deleteDoc(doc(firebaseDb, "users", owner(), "links", "steam"));
}

export type SyncReport = {
  added: number;
  updated: number;
  /** Steam games IGDB does not know. */
  missing: number;
};

/** Imports owned games with play time and the wishlist. */
export async function syncSteam(steamId?: string): Promise<SyncReport> {
  const uid = owner();
  // Right after linking, the link snapshot may not have arrived yet.
  const link = steamId ? { steamId } : state.steam;
  if (!link) throw new Error("Steam не подключён.");
  const lib = await steamLibrary(link.steamId);
  if (lib.private)
    throw new Error(
      "Steam не показывает игры. Открой в настройках приватности Steam «Доступ к игровой информации: открытый».",
    );
  const appIds = [
    ...new Set([...lib.games.map((g) => g.appId), ...lib.wishlist]),
  ];
  const ids = await idsFromSteam(appIds);
  const summaries = new Map(
    (await manyGames([...new Set(ids.values())])).map((g) => [g.id, g]),
  );
  const summary = (id: number, appId: number, name: string) => {
    const g = summaries.get(id);
    return {
      id,
      title: g?.name || name,
      cover: g?.cover
        ? imageUrl(g.cover, "cover_big")
        : `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`,
      year: g?.year ? String(g.year) : "",
      genre: g?.genres[0] || "",
    };
  };
  const owned = lib.games
    .filter((g) => ids.has(g.appId))
    .map((g) => {
      const id = ids.get(g.appId)!;
      const play: SteamPlay = {
        appId: g.appId,
        minutes: g.minutes,
        recent: g.recent,
        lastPlayed: g.lastPlayed,
      };
      return { id, play, summary: summary(id, g.appId, g.name) };
    });
  const wished = lib.wishlist
    .filter((appId) => ids.has(appId))
    .map((appId) => {
      const id = ids.get(appId)!;
      return { id, summary: summary(id, appId, "") };
    })
    .filter((w) => w.summary.title);
  const known = new Set(state.games.map((g) => g.id));
  const changed = mergeSteam(state.games, owned, wished);
  for (let i = 0; i < changed.length; i += 400) {
    const batch = writeBatch(firebaseDb);
    for (const entry of changed.slice(i, i + 400)) {
      const value = parseEntry(entry);
      if (known.has(value.id))
        // Existing games keep their place in "recent": no new timestamp.
        batch.update(ref(uid, value.id), {
          platforms: value.platforms,
          status: value.status,
          ...(value.steam ? { steam: value.steam } : {}),
        });
      else
        batch.set(ref(uid, value.id), {
          ...value,
          updatedAt: (value.steam?.lastPlayed ?? 0) * 1000,
        });
    }
    await batch.commit();
  }
  await updateDoc(doc(firebaseDb, "users", uid, "links", "steam"), {
    syncedAt: serverTimestamp(),
  });
  const added = changed.filter((e) => !known.has(e.id)).length;
  return {
    added,
    updated: changed.length - added,
    missing: appIds.filter((id) => !ids.has(id)).length,
  };
}

/* ------------------------------------------------ device → cloud move */

const LOCAL = "umbra.gamesLibrary";
let moving = false;

/**
 * Games saved on this device before the cloud collection are uploaded once
 * (already matched to IGDB ids), then kept as a backup copy.
 */
async function moveLocalGames(uid: string) {
  if (moving) return;
  const raw = readStorage(LOCAL);
  if (!raw) return;
  moving = true;
  try {
    const { migrateGameLibrary } = await import("./gameMigration");
    await migrateGameLibrary();
    const rows = JSON.parse(readStorage(LOCAL) || "[]") as Array<
      Record<string, unknown>
    >;
    const cloud = new Set(state.games.map((g) => g.id));
    const batch = writeBatch(firebaseDb);
    let count = 0;
    for (const row of rows) {
      if (row.source !== "igdb" || cloud.has(Number(row.id))) continue;
      try {
        const cover = String(row.thumbnail || "");
        const entry = parseEntry({
          id: row.id,
          title: row.title,
          cover: /^https:\/\/images\.igdb\.com\//.test(cover) ? cover : "",
          year: row.year,
          genre: row.genre,
          platforms: [],
          status: row.status === "played" ? "played" : "want",
          rating: row.rating ?? null,
          note: row.note ?? "",
          hours: null,
          updatedAt: Number(row.updatedAt) || 0,
        });
        batch.set(ref(uid, entry.id), entry);
        count++;
      } catch {
        // Unreadable rows stay in the backup copy.
      }
    }
    if (count) await batch.commit();
    writeStorage(`${LOCAL}.backup`, raw);
    writeStorage(LOCAL, null);
  } catch {
    // Retried on the next snapshot.
  } finally {
    moving = false;
  }
}
