export type RequestPriority = "high" | "normal" | "low";

type Waiter = { rank: number; resolve: () => void };
type LaneQueue = { running: number; limit: number; queue: Waiter[] };

const RANK: Record<RequestPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

const pending = new Map<
  string,
  { promise: Promise<unknown>; waiter?: Waiter; lane?: LaneQueue }
>();
const cache = new Map<string, { until: number; value: unknown }>();
// Keep small same-origin catalog files responsive while remote feeds are busy.
const lanes: { local: LaneQueue; remote: LaneQueue } = {
  local: { running: 0, limit: 3, queue: [] },
  remote: { running: 0, limit: 6, queue: [] },
};

function enqueue(lane: LaneQueue, waiter: Waiter) {
  const idx = lane.queue.findIndex((w) => w.rank > waiter.rank);
  if (idx < 0) lane.queue.push(waiter);
  else lane.queue.splice(idx, 0, waiter);
}

function promote(lane: LaneQueue, waiter: Waiter, nextRank: number) {
  if (nextRank >= waiter.rank) return;
  const idx = lane.queue.indexOf(waiter);
  waiter.rank = nextRank;
  if (idx >= 0) {
    lane.queue.splice(idx, 1);
    enqueue(lane, waiter);
  }
}

async function slot<T>(
  url: string,
  rank: number,
  entry: { waiter?: Waiter; lane?: LaneQueue },
  fn: () => Promise<T>,
): Promise<T> {
  const lane =
    url.startsWith("/") && !url.startsWith("//") ? lanes.local : lanes.remote;
  if (lane.running >= lane.limit) {
    await new Promise<void>((resolve) => {
      const waiter: Waiter = { rank, resolve };
      entry.waiter = waiter;
      entry.lane = lane;
      enqueue(lane, waiter);
    });
    entry.waiter = undefined;
    entry.lane = undefined;
  } else {
    lane.running++;
  }
  try {
    return await fn();
  } finally {
    const next = lane.queue.shift();
    if (next) next.resolve();
    else lane.running--;
  }
}

export async function requestJson<T>(
  url: string,
  ttl = 60_000,
  options?: { priority?: RequestPriority },
): Promise<T> {
  const hit = cache.get(url);
  if (hit && hit.until > Date.now()) return hit.value as T;
  const rank = RANK[options?.priority ?? "normal"];
  const inflight = pending.get(url);
  if (inflight) {
    if (inflight.waiter && inflight.lane)
      promote(inflight.lane, inflight.waiter, rank);
    return inflight.promise as Promise<T>;
  }
  const entry: {
    promise: Promise<unknown>;
    waiter?: Waiter;
    lane?: LaneQueue;
  } = { promise: Promise.resolve() };
  const task = slot(url, rank, entry, async () => {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      } catch {
        if (attempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        throw new Error("NETWORK");
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 1) {
        const seconds = Number(response.headers.get("retry-after")) || 1;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(5000, Math.max(500, seconds * 1000))),
        );
        continue;
      }
      if (!response.ok)
        throw new Error(
          response.status === 401 ? "BAD_KEY" : `HTTP_${response.status}`,
        );
      const value: unknown = await response.json();
      cache.set(url, { until: Date.now() + ttl, value });
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
      return value as T;
    }
  });
  entry.promise = task;
  pending.set(url, entry);
  try {
    return await task;
  } finally {
    pending.delete(url);
  }
}
