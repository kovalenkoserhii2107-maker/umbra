import { describe, expect, it } from "vitest";
import { UsageCounter } from "../../worker/src/usage";
import { bump } from "../../worker/src/http";
import type { Deps } from "../../worker/src/env";

function counter() {
  const data = new Map<string, unknown>();
  let alarm: number | null = null;
  const object = new UsageCounter({
    storage: {
      get: async <T>(k: string) => data.get(k) as T | undefined,
      put: async <T>(k: string, v: T) => void data.set(k, v),
      deleteAll: async () => data.clear(),
      setAlarm: async (t: number) => void (alarm = t),
    },
  });
  const take = async (limit: number) =>
    (
      (await (
        await object.fetch(
          new Request("https://usage/take", {
            method: "POST",
            body: JSON.stringify({ limit }),
          }),
        )
      ).json()) as { ok: boolean }
    ).ok;
  return { object, take, alarm: () => alarm, data };
}

describe("daily limits in a Durable Object", () => {
  it("allow exactly the limit, then refuse; the day's counter is forgotten later", async () => {
    const c = counter();
    expect(await c.take(2)).toBe(true);
    expect(c.alarm()).not.toBeNull();
    expect(await c.take(2)).toBe(true);
    expect(await c.take(2)).toBe(false);
    expect(await c.take(2)).toBe(false);
    await c.object.alarm();
    expect(c.data.size).toBe(0);
  });

  it("are what bump() asks when the worker has them", async () => {
    const keys: string[] = [];
    const deps = {
      usage: (key: string) => ({
        take: async (limit: number) => {
          keys.push(key);
          return keys.length <= limit;
        },
      }),
      cache: null,
    } as unknown as Deps;
    expect(await bump(deps, "ai/count/2026-10-26/all", 1)).toBe(true);
    expect(await bump(deps, "ai/count/2026-10-26/all", 1)).toBe(false);
    expect(keys).toEqual([
      "ai/count/2026-10-26/all",
      "ai/count/2026-10-26/all",
    ]);
  });
});
