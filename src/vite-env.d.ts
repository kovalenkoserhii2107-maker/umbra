/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Free OMDb key for Rotten Tomatoes and Metacritic scores. */
  readonly VITE_OMDB_KEY?: string;
  /** TMDB API key; the built-in one is used when it is not set. */
  readonly VITE_TMDB_KEY?: string;
  /** Address of the Umbra API worker (worker/), e.g. https://umbra-api.x.workers.dev. */
  readonly VITE_API_URL?: string;
}
