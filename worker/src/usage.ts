/**
 * Daily limits (the AI budget, TV codes, commands to the TV) counted in a
 * Durable Object: one counter per key for the whole world, and each request
 * handled after the previous one — no two can slip past the limit together,
 * as they could with the edge cache, which also counts per data centre.
 */

export type UsageStore = (key: string) => {
  /** Counts one more use; false once `limit` is reached. */
  take(limit: number): Promise<boolean>;
};

type DurableState = {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    deleteAll(): Promise<void>;
    setAlarm(time: number): Promise<void>;
  };
};

/** One counter (its key carries the day: "ai/count/2026-10-26/all"). */
export class UsageCounter {
  private state: DurableState;
  constructor(state: DurableState) {
    this.state = state;
  }

  async fetch(request: Request) {
    const { limit } = (await request.json()) as { limit: number };
    const count = (await this.state.storage.get<number>("count")) ?? 0;
    if (count >= limit) return Response.json({ ok: false });
    await this.state.storage.put("count", count + 1);
    // The day's counter is not needed after it: forget it two days later.
    if (count === 0)
      await this.state.storage.setAlarm(Date.now() + 2 * 86400_000);
    return Response.json({ ok: true });
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}

type Namespace = {
  idFromName(name: string): unknown;
  get(id: unknown): {
    fetch(url: string, init: RequestInit): Promise<Response>;
  };
};

export function durableUsage(namespace: Namespace): UsageStore {
  return (key) => ({
    async take(limit) {
      const stub = namespace.get(namespace.idFromName(key));
      const response = await stub.fetch("https://usage/take", {
        method: "POST",
        body: JSON.stringify({ limit }),
      });
      return ((await response.json()) as { ok: boolean }).ok;
    },
  });
}
