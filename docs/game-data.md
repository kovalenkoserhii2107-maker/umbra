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

## Caching

Feed queries use the start of the current UTC day as "now", so the same query
text repeats for a whole day and is served from the worker's edge cache. The
client also reuses identical IGDB answers for 10 minutes, and the service
worker caches IGDB images for two weeks.

## Library entries from the old catalog

Entries saved before the move have Steam app ids (PC) or nine-digit Metacritic
ids (consoles). On the games pages they are matched once per session: Steam ids
through IGDB `external_games`, the others by title. Matched entries get the
IGDB id and `source: "igdb"`; the rest keep linking to a search by title.
