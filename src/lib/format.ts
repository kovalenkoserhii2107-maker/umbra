export function yearOf(date?: string | null) {
  if (!date) return ''
  return date.slice(0, 4)
}

export function runtimeLabel(minutes?: number | null) {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} мин`
  return `${h} ч ${m} мин`
}

export function scoreColor(score: number) {
  if (score >= 7.5) return 'text-ok'
  if (score >= 6) return 'text-accent'
  return 'text-mute'
}

export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
