import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "./storage";
import { PLATFORM_GROUPS, type PlatformGroupId } from "./igdb";

/** The platforms the player owns; the feed and search start from them. */
const KEY = "umbra.gamePlatforms";
const ALL = PLATFORM_GROUPS.map((g) => g.id) as PlatformGroupId[];
const listeners = new Set<() => void>();

function read(): PlatformGroupId[] {
  try {
    const raw = JSON.parse(readStorage(KEY) || "null") as unknown;
    if (!Array.isArray(raw)) return ALL;
    const list = ALL.filter((id) => raw.includes(id));
    return list.length ? list : ALL;
  } catch {
    return ALL;
  }
}

let snapshot = read();

export function setMyPlatforms(next: PlatformGroupId[]) {
  const list = ALL.filter((id) => next.includes(id));
  snapshot = list.length ? list : ALL;
  writeStorage(KEY, JSON.stringify(snapshot));
  listeners.forEach((l) => l());
}

export function toggleMyPlatform(id: PlatformGroupId) {
  const has = snapshot.includes(id);
  // At least one platform stays chosen.
  if (has && snapshot.length === 1) return;
  setMyPlatforms(has ? snapshot.filter((p) => p !== id) : [...snapshot, id]);
}

export function useMyPlatforms() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
}
