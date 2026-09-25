import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Empty, ErrorBox, Grid } from '../components'
import { catalog, profileUrl, type PersonHit } from '../lib/catalog'
import { SEARCH_GENRES, applySearch, defaultFilters, type SearchFilters, type SearchKind, type SearchSort } from '../lib/search'
import { tmdb, type TmdbItem } from '../lib/tmdb'

const YEARS = Array.from({ length: 36 }, (_, i) => String(new Date().getFullYear() - i))
const SCORES = [0, 5, 6, 7, 8, 9]

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q')?.trim() || ''
  const [draft, setDraft] = useState(q)
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters)
  const [items, setItems] = useState<TmdbItem[]>([])
  const [people, setPeople] = useState<PersonHit[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraft(q), [q])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const request = q
      ? Promise.all([tmdb.searchCatalog(q, 1), catalog.people(q, 1)]).then(([data, persons]) => ({ data, persons: persons.results.slice(0, 12) }))
      : catalog.browseFiltered(filters, 1).then((data) => ({ data, persons: [] as PersonHit[] }))
    request
      .then(({ data, persons }) => {
        if (!alive) return
        setItems(data.results)
        setPeople(persons)
        setPage(1)
        setPages(data.total_pages)
      })
      .catch((err: Error) => {
        if (alive) setError(err.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [q, q ? '' : JSON.stringify(filters)])

  const shown = useMemo(() => applySearch(items, q, q ? filters : { ...filters, year: '', genre: null, minScore: 0 }), [items, q, filters])

  function commitQuery(value: string) {
    const next = value.trim()
    const copy = new URLSearchParams(params)
    if (next) copy.set('q', next)
    else copy.delete('q')
    setParams(copy, { replace: true })
  }

  async function loadMore() {
    if (loading || page >= pages) return
    setLoading(true)
    try {
      const data = q ? await tmdb.searchCatalog(q, page + 1) : await catalog.browseFiltered(filters, page + 1)
      setItems((list) => {
        const seen = new Set(list.map((item) => `${item.media_type}:${item.id}`))
        return list.concat(data.results.filter((item) => !seen.has(`${item.media_type}:${item.id}`)))
      })
      setPage(data.page)
      setPages(data.total_pages)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function chip(active: boolean) {
    return active
      ? 'rounded-full border border-ink bg-ink px-3 py-1 text-xs text-canvas'
      : 'rounded-full border border-hairline px-3 py-1 text-xs text-mute'
  }

  if (error) return <ErrorBox code={error} />

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">поиск</p>
      <h1 className="mt-1 text-3xl tracking-tight">{q || 'Найти фильм, сериал или человека'}</h1>

      <form className="mt-5" onSubmit={(e) => { e.preventDefault(); commitQuery(draft) }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Название, актёр, режиссёр"
          className="w-full rounded-full border border-hairline bg-card px-4 py-3 text-sm outline-none focus:border-accent/60"
        />
      </form>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {([['all', 'Всё'], ['movie', 'Фильмы'], ['tv', 'Сериалы']] as Array<[SearchKind, string]>).map(([id, label]) => (
            <button key={id} className={chip(filters.kind === id)} onClick={() => setFilters((f) => ({ ...f, kind: id }))}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {([['relevance', 'По смыслу'], ['popular', 'Популярные'], ['rating', 'Рейтинг'], ['year', 'Новизна']] as Array<[SearchSort, string]>).map(([id, label]) => (
            <button key={id} className={chip(filters.sort === id)} onClick={() => setFilters((f) => ({ ...f, sort: id }))}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {SCORES.map((n) => (
            <button key={n} className={chip(filters.minScore === n)} onClick={() => setFilters((f) => ({ ...f, minScore: n }))}>
              {n === 0 ? 'Любой рейтинг' : `${n}+`}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button className={chip(!filters.year)} onClick={() => setFilters((f) => ({ ...f, year: '' }))}>Любой год</button>
          {YEARS.map((year) => (
            <button key={year} className={chip(filters.year === year)} onClick={() => setFilters((f) => ({ ...f, year }))}>{year}</button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button className={chip(!filters.genre)} onClick={() => setFilters((f) => ({ ...f, genre: null }))}>Все жанры</button>
          {SEARCH_GENRES.map((genre) => (
            <button key={genre.id} className={chip(filters.genre === genre.id)} onClick={() => setFilters((f) => ({ ...f, genre: genre.id }))}>{genre.label}</button>
          ))}
        </div>
      </div>

      {loading && !items.length ? (
        <p className="mt-6 text-sm text-mute">Ищу…</p>
      ) : (
        <div className="mt-6 space-y-8">
          {people.length ? (
            <section>
              <h2 className="mb-3 text-lg">Люди</h2>
              <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
                {people.map((person) => (
                  <Link key={person.id} to={`/person/${person.id}`} className="w-20 shrink-0 text-center">
                    {person.profile_path ? (
                      <img src={profileUrl(person.profile_path)} alt="" className="mx-auto h-20 w-20 rounded-full object-cover" />
                    ) : (
                      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-card text-sm text-mute">{person.name.slice(0, 1)}</div>
                    )}
                    <p className="mt-2 line-clamp-2 text-xs">{person.name}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          {shown.length ? (
            <section>
              <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-dim">{shown.length} тайтлов</p>
              <Grid items={shown} />
              {page < pages ? (
                <div className="mt-8 flex justify-center">
                  <button onClick={loadMore} className="rounded-full border border-hairline px-4 py-2 text-sm" disabled={loading}>
                    {loading ? 'Загрузка…' : 'Ещё результаты'}
                  </button>
                </div>
              ) : null}
            </section>
          ) : (
            <Empty text="Ничего не подошло. Сбрось фильтры или поменяй запрос." />
          )}
        </div>
      )}
    </div>
  )
}
