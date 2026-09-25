import { kindOf, titleOf, type MediaType, type TmdbItem } from './tmdb'

export const SEARCH_GENRES = [
  { id: 28, label: 'Боевик' },
  { id: 12, label: 'Приключения' },
  { id: 16, label: 'Анимация' },
  { id: 35, label: 'Комедия' },
  { id: 80, label: 'Криминал' },
  { id: 99, label: 'Док' },
  { id: 18, label: 'Драма' },
  { id: 10751, label: 'Семья' },
  { id: 14, label: 'Фэнтези' },
  { id: 27, label: 'Ужасы' },
  { id: 9648, label: 'Детектив' },
  { id: 10749, label: 'Мелодрама' },
  { id: 878, label: 'Фантастика' },
  { id: 53, label: 'Триллер' },
  { id: 10752, label: 'Война' },
] as const

export type SearchKind = 'all' | MediaType
export type SearchSort = 'relevance' | 'popular' | 'rating' | 'year'

export type SearchFilters = {
  kind: SearchKind
  year: string
  genre: number | null
  minScore: number
  sort: SearchSort
}

export const defaultFilters: SearchFilters = {
  kind: 'all',
  year: '',
  genre: null,
  minScore: 0,
  sort: 'relevance',
}

function fold(value: string) {
  return value.toLowerCase().replace(/[ё]/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function yearOfItem(item: TmdbItem) {
  return Number((item.release_date || item.first_air_date || '').slice(0, 4)) || 0
}

export function relevanceScore(item: TmdbItem, query: string) {
  const q = fold(query)
  const title = fold(titleOf(item))
  const original = fold(item.original_title || item.original_name || '')
  let score = Math.log10((item.popularity || 1) + 1) * 12
  const votes = item.vote_count || 0
  const rating = item.vote_average || 0
  score += rating * Math.min(1, votes / 250) * 6
  if (item.poster_path) score += 4
  const year = yearOfItem(item)
  if (year >= new Date().getFullYear() - 2) score += 3

  if (q) {
    if (title === q || original === q) score += 120
    else if (title.startsWith(q) || original.startsWith(q)) score += 70
    else if (title.includes(q) || original.includes(q)) score += 40
    else {
      const parts = q.split(' ').filter(Boolean)
      const hits = parts.filter((part) => title.includes(part) || original.includes(part)).length
      score += hits * 10
    }
  }
  return score
}

export function applySearch(items: TmdbItem[], query: string, filters: SearchFilters) {
  const year = Number(filters.year) || 0
  const filtered = items.filter((item) => {
    if (item.media_type === 'person') return false
    const kind = kindOf(item)
    if (filters.kind !== 'all' && kind !== filters.kind) return false
    if (year && yearOfItem(item) !== year) return false
    if (filters.genre && !(item.genre_ids || []).includes(filters.genre)) return false
    if (filters.minScore && (item.vote_average || 0) < filters.minScore) return false
    return true
  })

  const copy = filtered.slice()
  if (filters.sort === 'popular') copy.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
  else if (filters.sort === 'rating') copy.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
  else if (filters.sort === 'year') copy.sort((a, b) => yearOfItem(b) - yearOfItem(a))
  else copy.sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query))
  return copy
}
