import { itemKey, type LibraryItem } from "./library";

/** Percent of agreement on titles both people rated; null under 3 titles. */
export function tasteMatch(
  mine: Array<Pick<LibraryItem, "type" | "id" | "rating">>,
  theirs: Array<Pick<LibraryItem, "type" | "id" | "rating">>,
) {
  const mineByKey = new Map(
    mine.filter((x) => x.rating !== null).map((x) => [itemKey(x), x.rating!]),
  );
  const diffs = theirs
    .filter((x) => x.rating !== null && mineByKey.has(itemKey(x)))
    .map((x) => Math.abs(mineByKey.get(itemKey(x))! - x.rating!));
  if (diffs.length < 3) return null;
  const avg = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  return { percent: Math.round(100 - (avg / 9) * 100), common: diffs.length };
}

/**
 * Keeps profiles/{uid}/ratings equal to the library, without notes. Runs only
 * while the person has friends; failures are ignored so saving never depends
 * on it.
 */
