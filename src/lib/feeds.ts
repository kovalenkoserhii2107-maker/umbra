import { tmdb, type MediaType, type TmdbItem, type TmdbPage } from './tmdb'

export type FeedId =
  | 'theaters'
  | 'trending'
  | 'airing'
  | 'upcoming'
  | 'watchlist'
  | 'imdb250-movie'
  | 'imdb250-tv'
  | 'recs'

export type FeedMeta = {
  id: FeedId
  title: string
  type?: MediaType
  more: boolean
}

export const FEEDS: FeedMeta[] = [
  { id: 'theaters', title: 'Сейчас в кинотеатрах', type: 'movie', more: true },
  { id: 'trending', title: 'Сейчас в тренде', more: true },
  { id: 'airing', title: 'Сериалы сегодня', type: 'tv', more: true },
  { id: 'upcoming', title: 'Скоро выйдут', type: 'movie', more: true },
  { id: 'watchlist', title: 'Хочу посмотреть', more: false },
  { id: 'imdb250-movie', title: 'Топ 250 фильмов IMDb', type: 'movie', more: true },
  { id: 'imdb250-tv', title: 'Топ 250 сериалов IMDb', type: 'tv', more: true },
  { id: 'recs', title: 'Рекомендации', more: true },
]

export function feedById(id: string) {
  return FEEDS.find((f) => f.id === id)
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function daysAhead(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function sortUpcoming(items: TmdbItem[]) {
  const start = Date.now()
  return items.slice().sort((a, b) => {
    const da = new Date(a.release_date || a.first_air_date || '').getTime()
    const db = new Date(b.release_date || b.first_air_date || '').getTime()
    const nearA = Number.isFinite(da) ? Math.max(0, da - start) : 1e15
    const nearB = Number.isFinite(db) ? Math.max(0, db - start) : 1e15
    const popA = a.popularity || 0
    const popB = b.popularity || 0
    const scoreA = nearA / 86400000 - popA / 40
    const scoreB = nearB / 86400000 - popB / 40
    return scoreA - scoreB
  })
}

export async function loadFeedPage(id: FeedId, page: number, recSeed?: { type: MediaType; id: number }): Promise<TmdbPage<TmdbItem>> {
  if (id === 'theaters') return tmdb.nowPlaying(page)
  if (id === 'trending') return tmdb.trending('week', page)
  if (id === 'airing') return tmdb.airingToday(page)
  if (id === 'upcoming') {
    const data = await tmdb.upcomingWindow(page, todayIso(), daysAhead(150))
    return { ...data, results: sortUpcoming(data.results) }
  }
  if (id === 'imdb250-movie') return tmdb.imdbChart('movie', page)
  if (id === 'imdb250-tv') return tmdb.imdbChart('tv', page)
  if (id === 'recs') {
    if (recSeed) return tmdb.recommendations(recSeed.type, recSeed.id, page)
    return tmdb.trending('week', page)
  }
  return { page: 1, results: [], total_pages: 0, total_results: 0 }
}
