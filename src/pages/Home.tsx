import { Row, ErrorBox, NeedKey, useAsync } from '../components'
import { hasApiKey, tmdb } from '../lib/tmdb'
import { useAppState } from '../state'

export function HomePage() {
  const { settings } = useAppState()
  const ready = hasApiKey()
  const trending = useAsync(() => tmdb.trending('week'), [settings.tmdbKey])
  const now = useAsync(() => tmdb.nowPlaying(), [settings.tmdbKey])
  const airing = useAsync(() => tmdb.airingToday(), [settings.tmdbKey])
  const upcoming = useAsync(() => tmdb.upcoming(), [settings.tmdbKey])
  const popularTv = useAsync(() => tmdb.popularTv(), [settings.tmdbKey])

  if (!ready) return <NeedKey />

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
