export type Platform = {
  id: number
  slug: string
  name: string
  short: string
  tint: string
}

export const PLATFORMS: Platform[] = [
  { id: 8, slug: 'netflix', name: 'Netflix', short: 'NFLX', tint: '#e50914' },
  { id: 337, slug: 'disney', name: 'Disney+', short: 'DSNY', tint: '#113ccf' },
  { id: 9, slug: 'prime', name: 'Prime Video', short: 'PRME', tint: '#00a8e1' },
  { id: 1899, slug: 'max', name: 'Max', short: 'MAX', tint: '#002be7' },
  { id: 350, slug: 'apple', name: 'Apple TV+', short: 'ATV+', tint: '#d4d4d4' },
  { id: 192, slug: 'youtube', name: 'YouTube', short: 'YT', tint: '#ff0033' },
]

export const REGIONS = [
  { code: 'UA', label: 'Украина' },
  { code: 'US', label: 'США' },
  { code: 'GB', label: 'Великобритания' },
  { code: 'DE', label: 'Германия' },
  { code: 'PL', label: 'Польша' },
] as const

export function platformBySlug(slug: string) {
  return PLATFORMS.find((p) => p.slug === slug)
}

export function platformById(id: number) {
  return PLATFORMS.find((p) => p.id === id)
}
