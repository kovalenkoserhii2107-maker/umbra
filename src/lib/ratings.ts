import { tmdb, type MediaType } from './tmdb'

type Entry = { imdb?: string; tmdb?: number; imdbId?: string }
type Cache = Record<string, Entry>

const CACHE_KEY = 'umbra.ratings'
const listeners = new Set<() => void>()
const inflight = new Map<string, Promise<string | null>>()

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

export function subscribeRatings(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify() {
  listeners.forEach((fn) => fn())
}

export function cachedRating(type: MediaType, id: number): Entry {
  return readCache()[keyOf(type, id)] || {}
}

export function rememberRating(type: MediaType, id: number, patch: Entry) {
  const all = readCache()
  all[keyOf(type, id)] = { ...all[keyOf(type, id)], ...patch }
  localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  notify()
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
    if (!res.ok) return null
    const data = await res.json()
    const row = Array.isArray(data) ? data[0] : data
    return formatScore(row?.rating)
  } catch {
    return null
  }
}

export async function ensureImdbRating(type: MediaType, id: number): Promise<string | null> {
  const existing = cachedRating(type, id)
  if (existing.imdb) return existing.imdb
  const key = keyOf(type, id)
  const pending = inflight.get(key)
  if (pending) return pending

  const task = (async () => {
    let imdbId = existing.imdbId
    if (!imdbId) {
      try {
        const ids = await tmdb.externalIds(type, id)
        imdbId = ids.imdb_id || undefined
        if (imdbId) rememberRating(type, id, { imdbId })
      } catch {
        return null
      }
    }
    const score = await fetchImdbRating(imdbId)
    if (score) rememberRating(type, id, { imdb: score, imdbId })
    return score
  })()

  inflight.set(key, task)
  try {
    return await task
  } finally {
    inflight.delete(key)
  }
}
