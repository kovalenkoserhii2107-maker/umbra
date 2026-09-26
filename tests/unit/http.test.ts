import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
it("deduplicates concurrent requests and caches successful responses", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ value: 1 })));
  vi.stubGlobal("fetch", fetcher);
  const { requestJson } = await import("../../src/lib/http");
  const values = await Promise.all([
    requestJson("https://example.test/1"),
    requestJson("https://example.test/1"),
  ]);
  expect(values).toEqual([{ value: 1 }, { value: 1 }]);
  await requestJson("https://example.test/1");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("limits concurrent network operations to six", async () => {
  let active = 0;
  let peak = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return new Response("{}");
    }),
  );
  const { requestJson } = await import("../../src/lib/http");
  await Promise.all(
    Array.from({ length: 20 }, (_, n) =>
      requestJson(`https://example.test/${n}`),
    ),
  );
  expect(peak).toBe(6);
});
it("does not retry authorization failures or cache their result", async () => {
  const fetcher = vi.fn(async () => new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  const { requestJson } = await import("../../src/lib/http");
  await expect(requestJson("https://example.test/1")).rejects.toThrow(
    "BAD_KEY",
  );
  await expect(requestJson("https://example.test/1")).rejects.toThrow(
    "BAD_KEY",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
