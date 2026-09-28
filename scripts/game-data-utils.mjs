export function text(html = "") {
  const entities = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(?:br\s*\/?|\/p|\/div|\/h\d|\/li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, e) =>
      e[0] === "#"
        ? String.fromCodePoint(
            Math.min(
              0x10ffff,
              parseInt(
                e.slice(e[1]?.toLowerCase() === "x" ? 2 : 1),
                e[1]?.toLowerCase() === "x" ? 16 : 10,
              ) || 32,
            ),
          )
        : entities[e.toLowerCase()],
    )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}
export function steamData(payload, id) {
  return (
    Object.values(payload ?? {}).find(
      (x) => x?.success && x.data?.steam_appid === id,
    )?.data ?? null
  );
}
export function score(value) {
  const n = Number(value);
  return value != null &&
    value !== "" &&
    Number.isFinite(n) &&
    n > 0 &&
    n <= 100
    ? n
    : null;
}
export function normalizeSteam(
  data,
  reviews,
  players,
  deals,
  stores,
  checkedAt,
) {
  const summary = reviews?.query_summary;
  const total = summary?.total_reviews;
  const modes = {
    2: "Один игрок",
    1: "Многопользовательская",
    9: "Кооператив",
    27: "Кооператив по сети",
    38: "Кооператив на одном экране",
    36: "PvP по сети",
    37: "PvP на одном экране",
    20: "MMO",
  };
  const offers = [];
  if (data.is_free)
    offers.push({
      store: "Steam",
      url: `https://store.steampowered.com/app/${data.steam_appid}/`,
      price: 0,
      currency: "UAH",
      region: "UA",
      checkedAt,
    });
  else if (data.price_overview && Number.isFinite(data.price_overview.final))
    offers.push({
      store: "Steam",
      url: `https://store.steampowered.com/app/${data.steam_appid}/`,
      price: data.price_overview.final / 100,
      regularPrice: data.price_overview.initial / 100,
      currency: data.price_overview.currency,
      region: "UA",
      checkedAt,
    });
  for (const d of Array.isArray(deals) ? deals : []) {
    if (
      Number(d.steamAppID) !== data.steam_appid ||
      !d.dealID ||
      !stores[d.storeID]
    )
      continue;
    const price = Number(d.salePrice),
      regularPrice = Number(d.normalPrice);
    if (!Number.isFinite(price) || price < 0) continue;
    offers.push({
      store: stores[d.storeID],
      url: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(d.dealID)}`,
      price,
      regularPrice,
      currency: "USD",
      region: "US",
      checkedAt,
      source: "CheapShark",
    });
  }
  return {
    steamAppId: data.steam_appid,
    description: text(
      data.detailed_description ||
        data.about_the_game ||
        data.short_description,
    ),
    short_description: text(data.short_description),
    thumbnail: data.header_image,
    developer: (data.developers || []).join(", "),
    publisher: (data.publishers || []).join(", "),
    genre: (data.genres || []).map((x) => text(x.description)).join(", "),
    platforms: Object.entries(data.platforms || {})
      .filter(([, v]) => v)
      .map(([k]) => ({ windows: "Windows", mac: "macOS", linux: "Linux" })[k])
      .filter(Boolean),
    modes: [
      ...new Set(
        (data.categories || []).map((x) => modes[x.id]).filter(Boolean),
      ),
    ],
    playerCount:
      players?.response?.result === 1 &&
      Number.isSafeInteger(players.response.player_count)
        ? players.response.player_count
        : null,
    releaseLabel: text(data.release_date?.date),
    comingSoon: !!data.release_date?.coming_soon,
    metacritic: score(data.metacritic?.score),
    metacriticUrl: data.metacritic?.url?.replace(/^http:/, "https:") || null,
    steam:
      total > 0 ? Math.round((100 * summary.total_positive) / total) : null,
    steamReviewCount: total > 0 ? total : null,
    screenshots: (data.screenshots || [])
      .slice(0, 12)
      .map((x) => ({ id: x.id, image: x.path_thumbnail, full: x.path_full })),
    requirements: text(data.pc_requirements?.minimum),
    offers,
    checkedAt,
  };
}
