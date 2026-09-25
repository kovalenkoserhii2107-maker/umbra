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
  const json = await res.json() as { data?: Array<{ id: string }> } | Array<{ id: string }>
  const list = Array.isArray(json)
    ? json.map((x) => x.id)
    : (json.data || []).map((x) => x.id)
  const ids = list.filter(Boolean)
  try {
    const prev = JSON.parse(localStorage.getItem(CHART_CACHE) || '{}') as { movie?: string[]; tv?: string[] }
    localStorage.setItem(CHART_CACHE, JSON.stringify({
      at: Date.now(),
      movie: kind === 'movie' ? ids : prev.movie || [],
      tv: kind === 'tv' ? ids : prev.tv || [],
    }))
  } catch {
    /* ignore */
  }
  return ids
}

function dateOf(item: TmdbItem) {
  return item.release_date || item.first_air_date || ''
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
  searchCatalog: async (query: string, page = 1): Promise<TmdbPage<TmdbItem>> => {
    const [movies, shows] = await Promise.all([
      request<TmdbPage<TmdbItem>>('/search/movie', { query, page }),
      request<TmdbPage<TmdbItem>>('/search/tv', { query, page }),
    ])
    const seen = new Set<string>()
    const results: TmdbItem[] = []
    for (const item of movies.results) {
      const key = `movie:${item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({ ...item, media_type: 'movie' })
    }
    for (const item of shows.results) {
      const key = `tv:${item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({ ...item, media_type: 'tv' })
    }
    return {
      page,
      results,
      total_pages: Math.max(movies.total_pages, shows.total_pages),
      total_results: movies.total_results + shows.total_results,
    }
  },
  details: (type: MediaType, id: number) =>
    request<TitleDetails>(`/${type}/${id}`, {
      append_to_response: 'videos,credits,watch/providers,external_ids,similar',
    }),
  externalIds: (type: MediaType, id: number) =>
    request<{ imdb_id?: string }>(`/${type}/${id}/external_ids`),
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
  discoverNewest: (type: MediaType, providerId: number, region: string, page = 1) =>
    request<TmdbPage<TmdbItem>>(`/discover/${type}`, {
      with_watch_providers: providerId,
      watch_region: region,
      with_watch_monetization_types: 'flatrate|free|ads',
      sort_by: type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc',
      page,
    }),
  discoverOriginals: (type: MediaType, companies?: number[], networks?: number[], page = 1) => {
    const params: Record<string, string | number | undefined> = {
      page,
      sort_by: type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc',
    }
    if (type === 'movie' && companies?.length) params.with_companies = companies.join('|')
    if (type === 'tv' && networks?.length) params.with_networks = networks.join('|')
    else if (type === 'tv' && companies?.length) params.with_companies = companies.join('|')
    return request<TmdbPage<TmdbItem>>(`/discover/${type}`, params)
  },
  platformNewest: async (
    providerId: number,
    region: string,
    companies?: number[],
    networks?: number[],
  ): Promise<TmdbItem[]> => {
    const originals = companies?.length || networks?.length
    const [om, ot, nm, nt] = await Promise.all([
      originals ? tmdb.discoverOriginals('movie', companies, networks, 1) : Promise.resolve({ results: [] as TmdbItem[] }),
      originals ? tmdb.discoverOriginals('tv', companies, networks, 1) : Promise.resolve({ results: [] as TmdbItem[] }),
      tmdb.discoverNewest('movie', providerId, region, 1),
      tmdb.discoverNewest('tv', providerId, region, 1),
    ])
    const seen = new Set<string>()
    const merged: TmdbItem[] = []
    const push = (item: TmdbItem, type: MediaType) => {
      const key = `${type}:${item.id}`
      if (seen.has(key)) return
      seen.add(key)
      merged.push({ ...item, media_type: type })
    }
    om.results.forEach((item) => push(item, 'movie'))
    ot.results.forEach((item) => push(item, 'tv'))
    merged.sort((a, b) => dateOf(b).localeCompare(dateOf(a)))
    const extras: TmdbItem[] = []
    ;[
      ...nm.results.map((item) => ({ ...item, media_type: 'movie' as const })),
      ...nt.results.map((item) => ({ ...item, media_type: 'tv' as const })),
    ].forEach((item) => {
      const key = `${kindOf(item)}:${item.id}`
      if (seen.has(key)) return
      seen.add(key)
      extras.push(item)
    })
    extras.sort((a, b) => dateOf(b).localeCompare(dateOf(a)))
    return [...merged, ...extras].slice(0, 20)
  },
  imdbChart: async (kind: MediaType, page = 1): Promise<TmdbPage<TmdbItem>> => {
    try {
      const ids = await chartIds(kind)
      const size = 20
      const slice = ids.slice((page - 1) * size, page * size)
      const found = await Promise.all(slice.map(async (imdbId) => {
        const hit = await tmdb.find(imdbId)
        const row = kind === 'tv' ? hit.tv_results[0] : hit.movie_results[0]
        if (!row) return null
        const item: TmdbItem = { ...row, media_type: kind }
        return item
      }))
      const results = found.filter((item): item is TmdbItem => item !== null)
      return {
        page,
        results,
        total_pages: Math.max(1, Math.ceil(ids.length / size)),
        total_results: ids.length,
      }
    } catch {
      return tmdb.topRated(kind, page)
    }
  },
}
