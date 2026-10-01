import { requestJson } from "./http";

export type Giveaway = {
  id: number;
  title: string;
  thumbnail: string;
  image: string;
  description: string;
  platforms: string;
  open_giveaway_url: string;
  type: string;
  end_date: string;
};

/** GamerPower platform names for the four platform groups. */
export const GIVEAWAY_PLATFORMS: Record<string, string[]> = {
  pc: ["pc"],
  playstation: ["ps4", "ps5"],
  xbox: ["xbox-one", "xbox-series-xs"],
  nintendo: ["switch"],
};

export async function platformGiveaways(platforms: string[]) {
  const results = await Promise.allSettled(
    platforms.map(async (platform) => {
      const data = await requestJson<Giveaway[] | { status?: number }>(
        `https://www.gamerpower.com/api/giveaways?platform=${platform}`,
        600_000,
      );
      return Array.isArray(data) ? data : [];
    }),
  );
  const successful = results.filter(
    (r): r is PromiseFulfilledResult<Giveaway[]> => r.status === "fulfilled",
  );
  if (!successful.length) throw new Error("NETWORK");
  const seen = new Set<number>();
  return successful
    .flatMap((r) => r.value)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}
