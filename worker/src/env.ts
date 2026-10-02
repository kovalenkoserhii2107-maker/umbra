/** Bindings from wrangler.toml [vars] and the secrets set by the deploy workflow. */
export type Env = {
  ALLOWED_ORIGINS?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  ITAD_API_KEY?: string;
  OPENCRITIC_API_KEY?: string;
  STEAM_API_KEY?: string;
  /** TMDB key for link previews of films (the public TMDB_KEY variable). */
  TMDB_KEY?: string;
  /** Where share links send people, e.g. https://…github.io/umbra/ */
  SITE_URL?: string;
};

/** The subset of the Cache API the worker uses; tests pass an in-memory one. */
export type CacheLike = {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
};

export type Deps = {
  env: Env;
  fetch: typeof fetch;
  cache: CacheLike | null;
  now: () => number;
  /** Lets cache writes finish after the response is sent. */
  waitUntil: (task: Promise<unknown>) => void;
};
