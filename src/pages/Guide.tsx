import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Empty, ErrorBox, Grid, useAsync } from '../components'
import { SEARCH_GENRES } from '../lib/search'
import { catalog } from '../lib/catalog'
import type { MediaType } from '../lib/tmdb'

const DECADES = [2020, 2010, 2000, 1990, 1980, 1970]

export function GuidePage() {
  return (
    <div className="rise space-y-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">справочник</p>
        <h1 className="mt-1 text-3xl tracking-tight">Жанры и годы</h1>
        <p className="mt-2 text-sm text-mute">Без запроса — просто выбери, что смотреть.</p>
      </div>
      <section>
        <h2 className="mb-3 text-lg">Жанры</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SEARCH_GENRES.map((genre) => (
            <Link key={genre.id} to={`/guide/${genre.id}`} className="rounded-2xl border border-hairline bg-card px-4 py-4 text-sm hover:border-accent/50">
              {genre.label}
            </Link>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg">Десятилетия</h2>
        <div className="flex flex-wrap gap-2">
          {DECADES.map((year) => (
            <Link key={year} to={`/guide/year/${year}`} className="rounded-full border border-hairline px-4 py-2 text-sm text-mute hover:text-ink">
              {year}-е
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

export function GuideListPage() {
  const { genreId, year } = useParams()
  const [kind, setKind] = useState<MediaType | 'all'>('all')
  const genre = SEARCH_GENRES.find((g) => String(g.id) === genreId)
  const decade = year ? Number(year) : 0
  const extra = useMemo(() => {
    const params: Record<string, string | number | undefined> = {}
    if (genre) params.with_genres = genre.id
    if (decade) {
      params['primary_release_date.gte'] = `${decade}-01-01`
      params['primary_release_date.lte'] = `${decade + 9}-12-31`
    }
    return params
  }, [genre, decade])

  const movies = useAsync(() => catalog.browse('movie', 1, extra), [genreId, year])
  const shows = useAsync(() => catalog.browse('tv', 1, decade ? {
    with_genres: extra.with_genres,
    'first_air_date.gte': `${decade}-01-01`,
    'first_air_date.lte': `${decade + 9}-12-31`,
  } : extra), [genreId, year])

  const error = movies.error || shows.error
  if (error && !movies.data && !shows.data) return <ErrorBox code={error} />

  const movieItems = (movies.data?.results ?? []).map((item) => ({ ...item, media_type: 'movie' as const }))
  const showItems = (shows.data?.results ?? []).map((item) => ({ ...item, media_type: 'tv' as const }))
  const items = kind === 'movie' ? movieItems : kind === 'tv' ? showItems : [...movieItems, ...showItems]

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">справочник</p>
      <h1 className="mt-1 text-3xl tracking-tight">{genre?.label || (decade ? `${decade}-е` : 'Подборка')}</h1>
      <div className="mt-4 flex gap-2">
        {([['all', 'Всё'], ['movie', 'Фильмы'], ['tv', 'Сериалы']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setKind(id)}
            className={`rounded-full border px-3 py-1 text-xs ${kind === id ? 'border-ink bg-ink text-canvas' : 'border-hairline text-mute'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {items.length ? <Grid items={items} /> : <Empty text="Пока пусто." />}
      </div>
    </div>
  )
}
