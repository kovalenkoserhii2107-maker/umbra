import { Link } from 'react-router-dom'
import { Row, ErrorBox, RatingBadge, useAsync } from '../components'
import { loadFeedPage, FEEDS } from '../lib/feeds'
import { useAppState } from '../state'
import { backdropUrl, kindOf, titleOf, type MediaType, type TmdbItem } from '../lib/tmdb'

function posterPathFromStored(url: string) {
  const match = url.match(/\/t\/p\/w\d+(\/.+)$/)
  return match ? match[1] : null
}

function Featured({ item }: { item: TmdbItem }) {
  const media = kindOf(item)
  const bg = backdropUrl(item.backdrop_path) || backdropUrl(item.poster_path, 'w780')
  return (
    <Link to={`/title/${media}/${item.id}`} className="relative mb-10 block overflow-hidden rounded-2xl border border-hairline bg-card">
      {bg ? (
        <img src={bg} alt="" className="aspect-[16/9] w-full object-cover sm:aspect-[21/9]" />
      ) : (
        <div className="aspect-[16/9] sm:aspect-[21/9]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">сейчас в кино</p>
        <p className="mt-1 text-2xl tracking-tight text-white sm:text-3xl">{titleOf(item)}</p>
      </div>
      <RatingBadge type={media} id={item.id} tmdbScore={item.vote_average} />
    </Link>
  )
}

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
      poster_path: posterPathFromStored(x.poster),
      media_type: x.type,
      release_date: x.year,
    }))

  const preview = (id: (typeof FEEDS)[number]['id']) => FEEDS.find((f) => f.id === id)!
  const hero = theaters.data?.results?.[0] || trending.data?.results?.[0]
  const theaterRest = (theaters.data?.results ?? []).slice(hero && theaters.data?.results?.[0]?.id === hero.id ? 1 : 0)

  return (
    <div className="rise space-y-2">
      {hero ? <Featured item={hero} /> : null}
      <Row title={preview('theaters').title} items={theaterRest} type="movie" to="/feed/theaters" />
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
