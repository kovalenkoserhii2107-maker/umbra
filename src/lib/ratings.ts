import type { MediaType } from './tmdb'

type Entry = { imdb?: string; tmdb?: number }
type Cache = Record<string, Entry>

const CACHE_KEY = 'umbra.ratings'

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Cache
  } catch {
    return {}
  }
}

function keyOf(type: MediaType, id: number) {
  return `${type}:${id}`
}

export function cachedRating(type: MediaType, id: number): Entry {
  return readCache()[keyOf(type, id)] || {}
}

export function rememberRating(type: MediaType, id: number, patch: Entry) {
  const all = readCache()
  all[keyOf(type, id)] = { ...all[keyOf(type, id)], ...patch }
  localStorage.setItem(CACHE_KEY, JSON.stringify(all))
}

function formatScore(value: number | string) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n.toFixed(1)
}

export async function fetchImdbRating(imdbId?: string | null): Promise<string | null> {
  if (!imdbId) return null
  try {
    const res = await fetch(`https://api.agregarr.org/api/ratings?id=${encodeURIComponent(imdbId)}`)
    if (res.ok) {
      const data = await res.json()
      const row = Array.isArray(data) ? data[0] : data
      const score = formatScore(row?.rating)
      if (score) return score
    }
  } catch {
    /* сеть или CORS */
  }
  return null
}
