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

export async function fetchImdbRating(imdbId?: string | null): Promise<string | null> {
  if (!imdbId) return null
  let omdbKey = ''
  try {
    omdbKey = (JSON.parse(localStorage.getItem('umbra.settings') || '{}') as { omdbKey?: string }).omdbKey || ''
  } catch {
    omdbKey = ''
  }
  if (!omdbKey) return null
  const url = new URL('https://www.omdbapi.com/')
  url.searchParams.set('i', imdbId)
  url.searchParams.set('apikey', omdbKey)
  const res = await fetch(url.toString())
  if (!res.ok) return null
  const data = (await res.json()) as { imdbRating?: string }
  if (!data.imdbRating || data.imdbRating === 'N/A') return null
  return data.imdbRating
}
