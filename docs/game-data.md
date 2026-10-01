# Game data

Games come from [IGDB](https://api-docs.igdb.com/) through the API worker
(`worker/`), which holds the Twitch keys IGDB needs. There are no game files in
the repository any more: the static Steam and console catalogs and the
Metacritic page scraping were removed.

## Sources on a game page

| What                                                                                                                | Source                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Name, cover, art, screenshots, videos, platforms, release dates, genres, modes, studios, series, DLC, similar games | IGDB `games`                                                                            |
| Age ratings (PEGI, ESRB…)                                                                                           | IGDB `games.age_ratings`, asked separately                                              |
| Russian interface, subtitles, voice                                                                                 | IGDB `language_supports`                                                                |
| Time to beat                                                                                                        | IGDB `game_time_to_beats`                                                               |
| OpenCritic score, tier, reviews                                                                                     | worker `/opencritic` (RapidAPI)                                                         |
| Russian description, Metascore, Steam reviews, achievements, players, PC requirements                               | worker `/steam/app/:id`, when IGDB knows the Steam app                                  |
| Store links                                                                                                         | IGDB websites; PlayStation Store, Microsoft Store and eShop fall back to a store search |

Every side source loads on its own; a source that fails or has no data is
simply not shown. Queries ask only for long-stable IGDB fields in the main
request, so a change in a newer field cannot break the whole page.

## Platforms

The four groups are PC (6), PlayStation 5 and 4 (167, 48), Xbox Series and One
(169, 49) and Nintendo Switch 2 and Switch (508, 130). "Мои платформы" is kept
in `localStorage` (`umbra.gamePlatforms`); the feed and search start from it.

## Feed

- **Популярные новинки**: games released in the last four months, ranked by
  reciprocal rank fusion of IGDB popularity (visits, playing, want to play),
  Steam peak players, Twitch viewers and IGDB hype.
- **Сейчас популярно**: released games, ranked by Twitch, playing, Steam peak
  and visits.
- **Самые ожидаемые**: unreleased games (or with no date) by hype and "want to
  play". Games named by the popularity lists are added even when the date query
  misses them, so a big title like GTA VI cannot fall out.
- **Скоро выйдут**: awaited games coming in the next two months, by date.
- **Game Pass**: recently added, coming and leaving lists; Microsoft Store ids
  are matched to IGDB through `external_games`.
- Popularity types are looked up by name on IGDB `popularity_types`.

## Caching

Feed queries use the start of the current UTC day as "now", so the same query
text repeats for a whole day and is served from the worker's edge cache. The
client also reuses identical IGDB answers for 10 minutes, and the service
worker caches IGDB images for two weeks.

## Collection

Games the player marks live in Firestore, `users/{uid}/games/{igdbId}`:
status (`want`, `playing`, `played`, `dropped`, `owned`), platforms (the four
groups), rating, note, hours entered by hand, and Steam play time for imported
games. The rule `validGame` in `firestore.rules` mirrors `parseEntry` in
`src/lib/gameEntry.ts`. The library page has a platform switcher with counts
(remembered on the device), status filters and sorting.

## Steam

"Войти через Steam" goes to Steam OpenID with `return_to` set to the site
root. Steam's answer is parked by `captureSteamReturn` before the app renders,
then the library page sends it to the worker (`/steam/verify`), which asks
Steam to confirm it. The SteamID is saved in `users/{uid}/links/steam`.

Sync reads owned games and the wishlist through the worker, matches Steam apps
to IGDB through `external_games`, and writes the changes in batches: existing
games keep the player's status, rating and note and get PC plus fresh play
time; new games come in as "owned" (or "playing" if played in the last two
weeks); the wishlist becomes "want". Sync runs after linking, on "Обновить",
and once per visit when the last one is older than 12 hours. The game card
shows the player's Steam hours and achievements, rarest first.

## Library entries from the old catalog

Entries saved before the move have Steam app ids (PC) or nine-digit Metacritic
ids (consoles). On the games pages they are matched once per session: Steam ids
through IGDB `external_games`, the others by title. Matched entries get the
IGDB id and `source: "igdb"`; the rest keep linking to a search by title.

After matching, they are uploaded to the cloud collection once and the device
copy is kept as `umbra.gamesLibrary.backup`.
