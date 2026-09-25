import { DEFAULT_TMDB_KEY, type MediaType, type TmdbItem, type TmdbPage } from './tmdb'

const BASE = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

export type PersonHit = {
  id: number
  name: string
  profile_path: string | null
  known_for_department?: string
  popularity?: number
}

function key() {
  return localStorage.getItem('umbra.tmdbKey')?.trim() || DEFAULT_TMDB_KEY
}

async function request<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(BASE + path)
  url.searchParams.set('api_key', key())
  url.searchParams.set('language', 'ru-RU')
  url.searchParams.set('include_adult', 'false')
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(res.status === 401 ? 'BAD_KEY' : `TMDB_${res.status}`)
  return res.json() as Promise<T>
}

export function profileUrl(path?: string | null, size = 'w185') {
  if (!path) return ''
  return `${IMG}/${size}${path}`
}

export const catalog = {
  people: (query: string, page = 1) => request<TmdbPage<PersonHit>>('/search/person', { query, page }),
  browse: (type: MediaType, page = 1, extra: Record<string, string | number | undefined> = {}) =>
    request<TmdbPage<TmdbItem>>(`/discover/${type}`, {
      page,
      sort_by: 'popularity.desc',
      'vote_count.gte': 40,
      ...extra,
    }),
}
