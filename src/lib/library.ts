import type { MediaType } from "./tmdb";
export type Status = "watchlist" | "watching" | "watched" | "dropped";
export type LibraryItem = {
  id: number;
  type: MediaType;
  title: string;
  poster: string;
  year: string;
  status: Status;
  rating: number | null;
  note: string;
  season?: number;
  episode?: number;
  updatedAt: number;
};
export type LibraryPatch = Partial<
  Pick<LibraryItem, "status" | "rating" | "note" | "season" | "episode">
>;
export const itemKey = (item: Pick<LibraryItem, "type" | "id">) =>
  `${item.type}-${item.id}`;
const statuses: Status[] = ["watchlist", "watching", "watched", "dropped"];
export function parseItem(value: unknown): LibraryItem {
  if (!value || typeof value !== "object")
    throw new Error("Некорректная запись в полке.");
  const v = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(v.id) ||
    Number(v.id) <= 0 ||
    !["movie", "tv"].includes(String(v.type)) ||
    !statuses.includes(v.status as Status)
  )
    throw new Error("Некорректный ID, тип или статус записи.");
  for (const [key, max] of Object.entries({
    title: 500,
    poster: 2048,
    year: 10,
    note: 5000,
  })) {
    if (typeof v[key] !== "string" || (v[key] as string).length > max)
      throw new Error(`Некорректное поле ${key}.`);
  }
  if (v.poster && !/^https:\/\/image\.tmdb\.org\//.test(String(v.poster)))
    throw new Error("Некорректный адрес постера.");
  if (
    v.rating !== null &&
    (typeof v.rating !== "number" ||
      !Number.isFinite(v.rating) ||
      v.rating < 1 ||
      v.rating > 10)
  )
    throw new Error("Оценка должна быть от 1 до 10.");
  const result: LibraryItem = {
    id: Number(v.id),
    type: v.type as MediaType,
    title: v.title as string,
    poster: v.poster as string,
    year: v.year as string,
    status: v.status as Status,
    rating: v.rating as number | null,
    note: v.note as string,
    updatedAt:
      typeof v.updatedAt === "number" && Number.isFinite(v.updatedAt)
        ? v.updatedAt
        : 0,
  };
  for (const key of ["season", "episode"] as const) {
    if (v[key] !== undefined) {
      if (!Number.isSafeInteger(v[key]) || Number(v[key]) < 0)
        throw new Error("Некорректный номер серии или сезона.");
      result[key] = Number(v[key]);
    }
  }
  return result;
}
export function parseImport(raw: string): LibraryItem[] {
  if (raw.length > 5_000_000)
    throw new Error("Файл слишком большой (максимум 5 МБ).");
  const value = JSON.parse(raw) as { version?: unknown; items?: unknown };
  if (
    !value ||
    (value.version !== undefined && value.version !== 1) ||
    !Array.isArray(value.items) ||
    value.items.length > 5000
  )
    throw new Error("Неподдерживаемый файл полки.");
  const unique = new Map<string, LibraryItem>();
  for (const row of value.items) {
    const item = parseItem(row);
    unique.set(itemKey(item), item);
  }
  return [...unique.values()];
}
