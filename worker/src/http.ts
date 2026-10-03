import type { CacheLike, Deps } from "./env";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function allowedOrigin(request: Request, list?: string) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = (list || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError)
    return json({ error: error.code, message: error.message }, error.status);
  return json({ error: "internal", message: "Unexpected error" }, 500);
}

export async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Cache keys are synthetic GET requests so POST bodies can be cached too. */
export function cacheKey(path: string) {
  return new Request(`https://cache.umbra-api.internal/${path}`);
}

/**
 * Returns a cached JSON body or runs `load`, caching a successful result for
 * `ttl` seconds. The body is returned as text to pass it through unchanged.
 */
export async function cached(
  deps: Deps,
  key: string,
  ttl: number,
  load: () => Promise<string>,
): Promise<{ body: string; hit: boolean }> {
  const cache: CacheLike | null = deps.cache;
  const request = cacheKey(key);
  const hit = cache ? await cache.match(request) : undefined;
  if (hit) return { body: await hit.text(), hit: true };
  const body = await load();
  if (cache)
    deps.waitUntil(
      cache.put(
        request,
        new Response(body, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${ttl}`,
          },
        }),
      ),
    );
  return { body, hit: false };
}
