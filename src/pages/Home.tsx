import { Row, ErrorBox, useAsync } from '../components'
import { loadFeedPage, FEEDS } from '../lib/feeds'
import { useAppState } from '../state'
import type { MediaType, TmdbItem } from '../lib/tmdb'

export function HomePage() {
  const { items } = useAppState()
  const seed = items.find((x) => x.status === 'watched' || x.status === 'watchlist') || items[0]
  const theaters = useAsync(() => loadFeedPage('theaters', 1), [])
  const trending = useAsync(() => loadFeedPage('trending', 1), [])
  const airing = useAsync(() => loadFeedPage('airing', 1), [])
  const upcoming = useAsync(() => loadFeedPage('upcoming', 1), [])
  const imdbMovies = useAsync(() => loadFeedPage('imdb250-movie', 1), [])
  const imdbTv = useAsync(() => loadFeedPage('imdb250-tv', 1), [])
  const recs = useAsync(
    () => loadFeedPage('recs', 1, seed ? { type: seed.type, id: seed.id } : undefined),
    [seed?.id, seed?.type],
  )

  const firstError = [theaters, trending].find((x) => x.error)?.error
  if (firstError && !theaters.data && !trending.data) return <ErrorBox code={firstError} />

  const watchlist: TmdbItem[] = items
    .filter((x) => x.status === 'watchlist')
    .map((x) => ({
      id: x.id,
      title: x.type === 'movie' ? x.title : undefined,
      name: x.type === 'tv' ? x.title : undefined,
      poster_path: x.poster.includes('/t/p/') ? x.poster.slice(x.poster.indexOf('/t/p/') + 11) : null,
      media_type: x.type,
      release_date: x.year,
    }))

  const preview = (id: (typeof FEEDS)[number]['id']) => FEEDS.find((f) => f.id === id)!

  return (
    <div className="rise space-y-2">
      <section className="mb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">лента</p>
        <h1 className="mt-1 text-3xl tracking-tight">Что смотреть</h1>
      </section>
      <Row title={preview('theaters').title} items={theaters.data?.results ?? []} type="movie" to="/feed/theaters" />
      <Row title={preview('trending').title} items={trending.data?.results ?? []} to="/feed/trending" />
      <Row title={preview('airing').title} items={airing.data?.results ?? []} type="tv" to="/feed/airing" />
      <Row title={preview('upcoming').title} items={upcoming.data?.results ?? []} type="movie" to="/feed/upcoming" />
      <Row title={preview('watchlist').title} items={watchlist} />
      <Row title={preview('imdb250-movie').title} items={imdbMovies.data?.results ?? []} type="movie" to="/feed/imdb250-movie" />
      <Row title={preview('imdb250-tv').title} items={imdbTv.data?.results ?? []} type="tv" to="/feed/imdb250-tv" />
      <Row title={preview('recs').title} items={recs.data?.results ?? []} type={seed?.type as MediaType | undefined} to="/feed/recs" />
    </div>
  )
}
