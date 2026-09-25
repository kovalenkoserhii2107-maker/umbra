import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Empty, ErrorBox, Grid } from '../components'
import { SEARCH_GENRES, applySearch, defaultFilters, type SearchFilters, type SearchKind, type SearchSort } from '../lib/search'
import { tmdb, type TmdbItem } from '../lib/tmdb'

const YEARS = Array.from({ length: 36 }, (_, i) => String(new Date().getFullYear() - i))

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q')?.trim() || ''
  const [draft, setDraft] = useState(q)
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters)
  const [items, setItems] = useState<TmdbItem[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraft(q), [q])

  useEffect(() => {
    if (!q) {
      setItems([])
      setPages(1)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    tmdb.searchCatalog(q, 1)
      .then((data) => {
        if (!alive) return
        setItems(data.results)
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
  }, [q])

  const shown = useMemo(() => applySearch(items, q, filters), [items, q, filters])

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
      const data = await tmdb.searchCatalog(q, page + 1)
      setItems((list) => {
        const seen = new Set(list.map((item) => `${item.media_type}:${item.id}`))
        const extra = data.results.filter((item) => !seen.has(`${item.media_type}:${item.id}`))
        return list.concat(extra)
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
      <h1 className="mt-1 text-3xl tracking-tight">{q || 'Найти фильм или сериал'}</h1>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault()
          commitQuery(draft)
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Название, франшиза, оригинальное имя"
          className="w-full rounded-full border border-hairline bg-card px-4 py-3 text-sm outline-none focus:border-accent/60"
        />
      </form>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {([
            ['all', 'Всё'],
            ['movie', 'Фильмы'],
            ['tv', 'Сериалы'],
          ] as Array<[SearchKind, string]>).map(([id, label]) => (
            <button key={id} className={chip(filters.kind === id)} onClick={() => setFilters((f) => ({ ...f, kind: id }))}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ['relevance', 'По смыслу'],
            ['popular', 'Популярные'],
            ['rating', 'Оценка'],
            ['year', 'Новизна'],
          ] as Array<[SearchSort, string]>).map(([id, label]) => (
            <button key={id} className={chip(filters.sort === id)} onClick={() => setFilters((f) => ({ ...f, sort: id }))}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {[0, 6, 7, 8].map((n) => (
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

      {!q ? (
        <Empty text="Введи название — сначала точные совпадения, потом популярные и высоко оценённые." />
      ) : loading && !items.length ? (
        <p className="mt-6 text-sm text-mute">Ищу…</p>
      ) : shown.length ? (
        <div className="mt-6">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-dim">{shown.length} из {items.length}</p>
          <Grid items={shown} />
          {page < pages ? (
            <div className="mt-8 flex justify-center">
              <button onClick={loadMore} className="rounded-full border border-hairline px-4 py-2 text-sm" disabled={loading}>
                {loading ? 'Загрузка…' : 'Ещё результаты'}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <Empty text="Ничего не подошло. Сбрось фильтры или поменяй запрос." />
      )}
    </div>
  )
}
