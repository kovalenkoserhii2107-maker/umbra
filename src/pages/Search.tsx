import { useSearchParams } from 'react-router-dom'
import { ErrorBox, Grid, useAsync } from '../components'
import { tmdb } from '../lib/tmdb'

export function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q')?.trim() || ''
  const result = useAsync(
    () => (q ? tmdb.search(q) : Promise.resolve({ page: 1, results: [], total_pages: 0, total_results: 0 })),
    [q],
  )

  if (result.error) return <ErrorBox code={result.error} />

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">поиск</p>
      <h1 className="mt-1 text-3xl tracking-tight">{q || 'Пустой запрос'}</h1>
      {result.loading ? (
        <p className="mt-6 text-sm text-mute">Ищу…</p>
      ) : (
        <div className="mt-6">
          <Grid items={result.data?.results ?? []} />
        </div>
      )}
    </div>
  )
}
