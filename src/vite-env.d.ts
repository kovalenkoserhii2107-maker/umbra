/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Free OMDb key for Rotten Tomatoes and Metacritic scores. */
  readonly VITE_OMDB_KEY?: string;
}
