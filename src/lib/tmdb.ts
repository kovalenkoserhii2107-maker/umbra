const BASE = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

export const DEFAULT_TMDB_KEY = 'efe08a32a1ab86042a1bc8f93ad63cc8'

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

export type PersonRef = {
  id: number
  name: string
  character?: string
  job?: string
  profile_path: string | null
}

export type Credits = {
  cast: PersonRef[]
  crew: PersonRef[]
}

export type Video = { key: string; site: string; type: string; name: string; official: boolean }

export type CreditWork = TmdbItem & {
  character?: string
  job?: string
  department?: string
  role?: string
  media_type?: MediaType | 'person'
}

export type PersonDetails = {
  id: number
  name: string
  biography?: string
  birthday?: string
  deathday?: string
  place_of_birth?: string
  profile_path?: string | null
  known_for_department?: string
  combined_credits?: {
    cast: CreditWork[]
    crew: CreditWork[]
  }
}

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
  created_by?: PersonRef[]
  'watch/providers'?: { results: Record<string, WatchGroup> }
  external_ids?: { imdb_id?: string }
  similar?: TmdbPage<TmdbItem>
}

function keyFromStore() {
  return localStorage.getItem('umbra.tmdbKey')?.trim() || DEFAULT_TMDB_KEY
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

const CHART_CACHE = 'umbra.imdbCharts'

async function chartIds(kind: MediaType): Promise<string[]> {
  try {
    const raw = localStorage.getItem(CHART_CACHE)
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; movie: string[]; tv: string[] }
      if (Date.now() - parsed.at < 1000 * 60 * 60 * 12 && parsed[kind]?.length) return parsed[kind]
    }
  } catch {
    /* ignore */
  }
  const url = kind === 'movie'
    ? 'https://imdb-top250.mmdju.workers.dev/top250'
    : 'https://imdb-top250.mmdju.workers.dev/toptv'
  const res = await fetch(url)
  if (!res.ok) throw new Error('CHART')
  const json = await res.json() as { data?: Array<{ id: string }>; id?: string }
  const list = Array.isArray((json as { data?: Array<{ id: string }> }).data)
    ? (json as { data: Array<{ id: string }> }).data.map((x) => x.id)
    : Array.isArray(json)
      ? (json as Array<{ id: string }>).map((x) => x.id)
      : []
  const ids = list.filter(Boolean)
  try {
    const prev = JSON.parse(localStorage.getItem(CHART_CACHE) || '{}') as { movie?: string[]; tv?: string[] }
    localStorage.setItem(CHART_CACHE, JSON.stringify({ at: Date.now(), movie: kind === 'movie' ? ids : prev.movie || [], tv: kind === 'tv' ? ids : prev.tv || [] }))
  } catch {
    /* ignore */
  }
  return ids
}

export const tmdb = {
  trending: (window: 'day' | 'week' = 'week', page = 1) => request<TmdbPage<TmdbItem>>(`/trending/all/${window}`, { page }),
  nowPlaying: (page = 1) => request<TmdbPage<TmdbItem>>('/movie/now_playing', { page }),
  upcoming: (page = 1) => request<TmdbPage<TmdbItem>>('/movie/upcoming', { page }),
  upcomingWindow: (page: number, from: string, to: string) =>
    request<TmdbPage<TmdbItem>>('/discover/movie', {
      page,
      sort_by: 'popularity.desc',
      'primary_release_date.gte': from,
      'primary_release_date.lte': to,
    }),
  airingToday: (page = 1) => request<TmdbPage<TmdbItem>>('/tv/airing_today', { page }),
  popularTv: (page = 1) => request<TmdbPage<TmdbItem>>('/tv/popular', { page }),
  topRated: (type: MediaType, page = 1) => request<TmdbPage<TmdbItem>>(`/${type}/top_rated`, { page }),
  recommendations: (type: MediaType, id: number, page = 1) =>
    request<TmdbPage<TmdbItem>>(`/${type}/${id}/recommendations`, { page }),
  search: (query: string, page = 1) => request<TmdbPage<TmdbItem>>('/search/multi', { query, page }),
  details: (type: MediaType, id: number) =>
    request<TitleDetails>(`/${type}/${id}`, {
      append_to_response: 'videos,credits,watch/providers,external_ids,similar',
    }),
  person: (id: number) =>
    request<PersonDetails>(`/person/${id}`, {
      append_to_response: 'combined_credits',
    }),
  find: (imdbId: string) =>
    request<{ movie_results: TmdbItem[]; tv_results: TmdbItem[] }>(`/find/${imdbId}`, {
      external_source: 'imdb_id',
    }),
  discover: (type: MediaType, providerId: number, region: string, page = 1) =>
    request<TmdbPage<TmdbItem>>(`/discover/${type}`, {
      with_watch_providers: providerId,
      watch_region: region,
      with_watch_monetization_types: 'flatrate|free|ads',
      sort_by: 'popularity.desc',
      page,
    }),
  imdbChart: async (kind: MediaType, page = 1): Promise<TmdbPage<TmdbItem>> => {
    try {
      const ids = await chartIds(kind)
      const size = 20
      const slice = ids.slice((page - 1) * size, page * size)
      const found = await Promise.all(slice.map(async (imdbId) => {
        const hit = await tmdb.find(imdbId)
        const row = kind === 'tv' ? hit.tv_results[0] : hit.movie_results[0]
        return row ? { ...row, media_type: kind } : null
      }))
      return {
        page,
        results: found.filter((x): x is TmdbItem => Boolean(x)),
        total_pages: Math.ceil(ids.length / size),
        total_results: ids.length,
      }
    } catch {
      return tmdb.topRated(kind, page)
    }
  },
}
