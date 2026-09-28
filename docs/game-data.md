# Game catalog and detail data

The app serves same-origin JSON on GitHub Pages. Opening a game fetches only
`catalog/details/{id}.json`, never FreeToGame with a Steam/console ID. A Steam
AppID is accepted only when the provider response's `steam_appid` matches.
Console IDs remain stable; they are never used to guess Steam image URLs.

`npm run dev` and `npm run build` generate `public/catalog/` from the checked-in
catalogs and `data/game-details/`. Generated files are ignored by Git and need
no credentials. The lightweight shelf/search indexes omit full descriptions,
screenshots, offers and system requirements. Game catalogs and detailed files are not precached:
only opened catalogs and visited games enter an 80-entry, one-day runtime cache. Missing entries do
not poison the HTTP cache, so revisiting a page can retry after network failure.

## Refresh

Run `npm run data:refresh` to refresh existing Steam catalog IDs using Steam
Store, Steam review summaries, Steam current-player counts and CheapShark.
The script identifies itself, limits concurrency, applies timeouts, honours
Retry-After, and stops requesting a rate-limited comparison provider for the
rest of the run. Other providers can continue. Successful snapshots are written
individually so interruption is recoverable. Recently refreshed files are skipped
for 24 hours. `GAME_DATA_LIMIT=20 npm run data:refresh` is useful for a small run;
`GAME_DATA_FORCE=1 npm run data:refresh` explicitly refreshes recent snapshots.
Review the data diff, run tests/build, and deploy through the normal Pages workflow.
Refresh is explicit, not an unconfigured automatic background service.

Steam offers are collected for country UA with the provider's actual currency.
CheapShark offers are US/USD and always link through its required deal redirect.
Offer timestamps travel with each price; a failed comparison request preserves
previous offers with their original timestamps. Missing price does not mean free.
Steam prices and availability may differ by account and country at checkout.

Steam percentage uses all reviews (`purchase_type=all`), including key activations,
with its review count. The detail page states this methodology: it may differ
from the storefront score, which only counts eligible Steam purchases.
Metacritic is a separate critic score. Missing scores stay missing. Current
Steam player count is a timestamped snapshot, not the maximum number of players
in a session. Supported modes are shown separately; unknown session limits are
not inferred. Console-only games do not get fictional Steam scores or PC prices.

Console games may reuse Steam details only when exactly one catalog title matches
(normalizing punctuation/trademarks). Their own description, platform and
Metacritic score remain authoritative. Reused modes, screenshots and offers are
explicitly labelled as PC data; this does not claim console feature/price parity.
Console-only screenshots/prices and exact session limits require another verified
provider and currently show an explicit unavailable state.

References: https://partner.steamgames.com/doc/store/getreviews and
https://apidocs.cheapshark.com/ .

## Known separate limitation

The existing game shelf (`gameLibrary.ts`) is still device-local, unlike the
cloud-backed movie shelf. These catalog changes do not migrate its ownership
or promise multi-device game synchronization. Do not automatically upload that
legacy device store into whichever account happens to sign in.
