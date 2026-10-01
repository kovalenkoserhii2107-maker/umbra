import type { Deps } from "./env";
import { ApiError, cached } from "./http";

const API = "https://api.isthereanydeal.com";

type Money = { amount?: number; currency?: string };
type RawDeal = {
  shop?: { id?: number; name?: string };
  price?: Money;
  regular?: Money;
  cut?: number;
  voucher?: string | null;
  storeLow?: Money | null;
  drm?: Array<{ name?: string }>;
  expiry?: string | null;
  url?: string;
};

export type Deal = {
  shop: string;
  price: number;
  regular: number;
  cut: number;
  currency: string;
  url: string;
  voucher: string | null;
  storeLow: number | null;
  drm: string[];
  expiry: string | null;
};

export type Prices =
  | { found: false }
  | {
      found: true;
      id: string;
      title: string;
      url: string;
      deals: Deal[];
      historyLow: { amount: number; currency: string } | null;
    };

function key(deps: Deps) {
  const value = deps.env.ITAD_API_KEY;
  if (!value)
    throw new ApiError(
      503,
      "itad_not_configured",
      "IsThereAnyDeal key is missing",
    );
  return value;
}

async function request<T>(deps: Deps, path: string, init?: RequestInit) {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key(deps))}`;
  const response = await deps.fetch(url, init);
  if (response.status === 429)
    throw new ApiError(429, "itad_limit", "IsThereAnyDeal rate limit");
  if (!response.ok)
    throw new ApiError(
      502,
      "itad_failed",
      `IsThereAnyDeal answered ${response.status}`,
    );
  return (await response.json()) as T;
}

export function compactDeal(d: RawDeal): Deal | null {
  if (typeof d.price?.amount !== "number" || !d.url) return null;
  return {
    shop: d.shop?.name || "",
    price: d.price.amount,
    regular: d.regular?.amount ?? d.price.amount,
    cut: d.cut ?? 0,
    currency: d.price.currency || "USD",
    url: d.url,
    voucher: d.voucher || null,
    storeLow: d.storeLow?.amount ?? null,
    drm: (d.drm ?? []).map((x) => x.name || "").filter(Boolean),
    expiry: d.expiry || null,
  };
}

export const country = (value: string | null) =>
  value && /^[A-Z]{2}$/.test(value) ? value : "US";

/** IsThereAnyDeal game id by Steam app id, else by title; kept 30 days. */
async function lookup(deps: Deps, appId: number | null, title: string) {
  const query = appId ? `appid=${appId}` : `title=${encodeURIComponent(title)}`;
  const { body } = await cached(
    deps,
    `itad/lookup/${query}`,
    2592000,
    async () =>
      JSON.stringify(
        await request<{
          found?: boolean;
          game?: { id?: string; slug?: string; title?: string };
        }>(deps, `/games/lookup/v1?${query}`),
      ),
  );
  const data = JSON.parse(body) as {
    found?: boolean;
    game?: { id?: string; slug?: string; title?: string };
  };
  return data.found && data.game?.id ? data.game : null;
}

/** Current prices in every PC store and the all-time low. */
export async function gamePrices(
  deps: Deps,
  appId: number | null,
  title: string,
  region: string,
): Promise<Prices> {
  const game = await lookup(deps, appId, title);
  if (!game?.id) return { found: false };
  const rows = await request<
    Array<{
      id?: string;
      historyLow?: { all?: Money | null };
      deals?: RawDeal[];
    }>
  >(deps, `/games/prices/v3?country=${region}&vouchers=true&capacity=8`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([game.id]),
  });
  const row = rows.find((r) => r.id === game.id) ?? rows[0];
  const low = row?.historyLow?.all;
  return {
    found: true,
    id: game.id,
    title: game.title || title,
    url: `https://isthereanydeal.com/game/${game.slug || game.id}/info/`,
    deals: (row?.deals ?? [])
      .map(compactDeal)
      .filter((d): d is Deal => d !== null)
      .sort((a, b) => a.price - b.price),
    historyLow:
      typeof low?.amount === "number"
        ? { amount: low.amount, currency: low.currency || "USD" }
        : null,
  };
}

export type DealItem = {
  title: string;
  slug: string;
  image: string;
  deal: Deal;
};

/** Notable PC deals right now, as IsThereAnyDeal ranks them. */
export async function currentDeals(deps: Deps, region: string) {
  const data = await request<{
    list?: Array<{
      title?: string;
      slug?: string;
      type?: string | null;
      assets?: { banner400?: string; banner300?: string; boxart?: string };
      deal?: RawDeal;
    }>;
  }>(deps, `/deals/v2?country=${region}&limit=60&mature=false`);
  const list: DealItem[] = [];
  for (const item of data.list ?? []) {
    const deal = item.deal ? compactDeal(item.deal) : null;
    if (!deal || !item.title || (item.type && item.type !== "game")) continue;
    list.push({
      title: item.title,
      slug: item.slug || "",
      image:
        item.assets?.banner400 ||
        item.assets?.banner300 ||
        item.assets?.boxart ||
        "",
      deal,
    });
  }
  return { list };
}
