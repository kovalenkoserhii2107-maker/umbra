import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "./storage";

export type GameShelfStatus = "played" | "want";

export type GameShelfItem = {
  id: number;
  title: string;
  thumbnail: string;
  year: string;
  genre: string;
  status: GameShelfStatus;
  rating: number | null;
  note: string;
  updatedAt: number;
};

const KEY = "umbra.gamesLibrary";
const listeners = new Set<() => void>();

function parseItem(value: unknown): GameShelfItem | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Number.isSafeInteger(v.id) || Number(v.id) <= 0) return null;
  if (v.status !== "played" && v.status !== "want") return null;
  if (typeof v.title !== "string" || typeof v.thumbnail !== "string")
    return null;
  const rating = v.rating;
  if (
    rating !== null &&
    (typeof rating !== "number" ||
      !Number.isFinite(rating) ||
      rating < 1 ||
      rating > 10)
  )
    return null;
  return {
    id: Number(v.id),
    title: v.title,
    thumbnail: v.thumbnail,
    year: typeof v.year === "string" ? v.year : "",
    genre: typeof v.genre === "string" ? v.genre : "",
    status: v.status,
    rating: rating as number | null,
    note: typeof v.note === "string" ? v.note : "",
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
  };
}

function readAll(): GameShelfItem[] {
  try {
    const raw = JSON.parse(readStorage(KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map(parseItem)
      .filter((item): item is GameShelfItem => item !== null);
  } catch {
    return [];
  }
}

let snapshot = readAll();

function publish(next: GameShelfItem[]) {
  if (!writeStorage(KEY, JSON.stringify(next)))
    throw new Error(
      "Не удалось сохранить игру. Проверь свободное место и доступ к хранилищу браузера.",
    );
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function saveGame(item: GameShelfItem) {
  if (!parseItem(item)) throw new Error("Проверь данные игры и оценку.");
  publish([item, ...readAll().filter((row) => row.id !== item.id)]);
}

export function removeGame(id: number) {
  publish(readAll().filter((row) => row.id !== id));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGameLibrary() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY && event.key !== null) return;
    snapshot = readAll();
    listeners.forEach((listener) => listener());
  });
}
