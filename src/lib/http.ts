const pending = new Map<string, Promise<unknown>>();
const cache = new Map<string, { until: number; value: unknown }>();
// Keep small same-origin catalog files responsive while remote feeds are busy.
const lanes = {
  local: { running: 0, limit: 3, queue: [] as Array<() => void> },
  remote: { running: 0, limit: 6, queue: [] as Array<() => void> },
};
async function slot<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const lane =
    url.startsWith("/") && !url.startsWith("//") ? lanes.local : lanes.remote;
  if (lane.running >= lane.limit)
    await new Promise<void>((resolve) => lane.queue.push(resolve));
  else lane.running++;
  try {
    return await fn();
  } finally {
    const next = lane.queue.shift();
    if (next) next();
    else lane.running--;
  }
}
export async function requestJson<T>(url: string, ttl = 60_000): Promise<T> {
  const hit = cache.get(url);
  if (hit && hit.until > Date.now()) return hit.value as T;
  const inflight = pending.get(url);
  if (inflight) return inflight as Promise<T>;
  const task = slot(url, async () => {
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
  pending.set(url, task);
  try {
    return await task;
  } finally {
    pending.delete(url);
  }
}
