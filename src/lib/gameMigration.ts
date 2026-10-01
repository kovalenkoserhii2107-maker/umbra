import { legacyGames, moveToIgdb } from "./gameLibrary";
import { idByTitle, idsFromSteam } from "./igdb";

let running: Promise<void> | null = null;

/**
 * The old catalog used Steam app ids for PC games and Metacritic ids (nine
 * digits) for console games. Both are looked up on IGDB once per session.
 */
export function migrateGameLibrary() {
  if (running) return running;
  running = (async () => {
    const legacy = legacyGames();
    if (!legacy.length) return;
    const steam = legacy.filter((g) => g.id < 10_000_000).map((g) => g.id);
    const map = await idsFromSteam(steam).catch(
      () => new Map<number, number>(),
    );
    for (const game of legacy)
      if (!map.has(game.id) && game.id >= 10_000_000) {
        const id = await idByTitle(game.title).catch(() => null);
        if (id) map.set(game.id, id);
      }
    if (map.size) moveToIgdb(map);
  })().catch(() => {
    running = null;
  });
  return running;
}
