const BASE = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

export type MediaType = 'movie' | 'tv'

export type TmdbItem = {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
  vote_count?: number
  media_type?: MediaType | 'person'
  genre_ids?: number[]
  popularity?: number
}

export type TmdbPage<T> = {
  page: number
  results: T[]
  total_pages: number
  total_results: number
}

export type WatchProvider = {
  provider_id: number
  provider_name: string
  logo_path: string
}

export type WatchGroup = {
  link?: string
  flatrate?: WatchProvider[]
  rent?: WatchProvider[]
  buy?: WatchProvider[]
  ads?: WatchProvider[]
  free?: WatchProvider[]
}

export type Credits = {
  cast: Array<{ id: number; name: string; character: string; profile_path: string | null }>
  crew: Array<{ id: number; name: string; job: string }>
}

export type Video = { key: string; site: string; type: string; name: string; official: boolean }

export type TitleDetails = TmdbItem & {
  tagline?: string
  runtime?: number
  episode_run_time?: number[]
  number_of_seasons?: number
  number_of_episodes?: number
  status?: string
  genres?: Array<{ id: number; name: string }>
  videos?: { results: Video[] }
  credits?: Credits
  'watch/providers'?: { results: Record<string, WatchGroup> }
  external_ids?: { imdb_id?: string }
  similar?: TmdbPage<TmdbItem>
}

function keyFromStore() {
  return localStorage.getItem('umbra.tmdbKey')?.trim() || ''
}

export function hasApiKey() {
  return Boolean(keyFromStore())
}

export function posterUrl(path?: string | null, size = 'w342') {
  if (!path) return ''
  return `${IMG}/${size}${path}`
}

export function backdropUrl(path?: string | null, size = 'w1280') {
  if (!path) return ''
  return `${IMG}/${size}${path}`
}

export function titleOf(item: Pick<TmdbItem, 'title' | 'name'>) {
  return item.title || item.name || 'Без названия'
}

export function kindOf(item: TmdbItem): MediaType {
  if (item.media_type === 'tv' || (!item.title && item.name)) return 'tv'
  return 'movie'
}

async function request<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const key = keyFromStore()
  if (!key) throw new Error('NO_KEY')
  const url = new URL(BASE + path)
  url.searchParams.set('api_key', key)
  url.searchParams.set('language', 'ru-RU')
  url.searchParams.set('include_adult', 'false')
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    if (res.status === 401) throw new Error('BAD_KEY')
    throw new Error(`TMDB_${res.status}`)
  }
  return res.json() as Promise<T>
}

export const tmdb = {
  trending: (window: 'day' | 'week' = 'week') => request<TmdbPage<TmdbItem>>(`/trending/all/${window}`),
  nowPlaying: () => request<TmdbPage<TmdbItem>>('/movie/now_playing'),
  upcoming: () => request<TmdbPage<TmdbItem>>('/movie/upcoming'),
  airingToday: () => request<TmdbPage<TmdbItem>>('/tv/airing_today'),
  popularTv: () => request<TmdbPage<TmdbItem>>('/tv/popular'),
  search: (query: string, page = 1) => request<TmdbPage<TmdbItem>>('/search/multi', { query, page }),
  details: (type: MediaType, id: number) =>
    request<TitleDetails>(`/${type}/${id}`, {
      append_to_response: 'videos,credits,watch/providers,external_ids,similar',
    }),
  discover: (type: MediaType, providerId: number, region: string, page = 1) =>
    request<TmdbPage<TmdbItem>>(`/discover/${type}`, {
      with_watch_providers: providerId,
      watch_region: region,
      with_watch_monetization_types: 'flatrate|free|ads',
      sort_by: 'popularity.desc',
      page,
    }),
}
