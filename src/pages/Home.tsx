import { Row, ErrorBox, useAsync } from '../components'
import { tmdb } from '../lib/tmdb'

export function HomePage() {
  const trending = useAsync(() => tmdb.trending('week'), [])
  const now = useAsync(() => tmdb.nowPlaying(), [])
  const airing = useAsync(() => tmdb.airingToday(), [])
  const upcoming = useAsync(() => tmdb.upcoming(), [])
  const popularTv = useAsync(() => tmdb.popularTv(), [])

  const firstError = [trending, now, airing].find((x) => x.error)?.error
  if (firstError && !trending.data) return <ErrorBox code={firstError} />

  return (
    <div className="rise space-y-2">
      <section className="mb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">лента</p>
        <h1 className="mt-1 text-3xl tracking-tight">Открытия недели</h1>
        <p className="mt-2 max-w-xl text-sm text-mute">
          То, что сейчас смотрят, выходит в прокат и идёт в эфире — без шума IMDb, с твоей полкой рядом.
        </p>
      </section>
      <Row title="Сейчас в тренде" items={trending.data?.results ?? []} />
      <Row title="В кино" items={now.data?.results ?? []} type="movie" />
      <Row title="Сериалы сегодня" items={airing.data?.results ?? []} type="tv" />
      <Row title="Скоро" items={upcoming.data?.results ?? []} type="movie" />
      <Row title="Популярные сериалы" items={popularTv.data?.results ?? []} type="tv" />
    </div>
  )
}
