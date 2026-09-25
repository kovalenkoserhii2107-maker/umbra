import { type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { kindOf, posterUrl, titleOf, type MediaType, type TmdbItem } from './lib/tmdb'
import { yearOf } from './lib/format'
import { cachedRating, ensureImdbRating, subscribeRatings } from './lib/ratings'
import { PLATFORMS } from './lib/providers'
import { InstallPrompt } from './components/InstallPrompt'
import { BrandLockup } from './components/Brand'
import { AccountMenu } from './components/AccountMenu'
import { SearchBox } from './components/SearchBox'

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6">{children}</main>
      <InstallPrompt />
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-canvas/90 backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-4">
          <Tab to="/" label="Лента" />
          <Tab to="/search" label="Поиск" />
          <Tab to="/platforms" label="Платформы" />
          <Tab to="/library" label="Полка" />
        </div>
      </nav>
    </div>
  )
}

function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `py-3 text-center font-mono text-[11px] tracking-[0.14em] uppercase ${isActive ? 'text-ink' : 'text-dim'}`}
    >
      {label}
    </NavLink>
  )
}

function Header() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="shrink-0">
          <BrandLockup />
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-mute md:flex">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'text-ink' : 'hover:text-ink'}>Лента</NavLink>
          <NavLink to="/search" className={({ isActive }) => isActive ? 'text-ink' : 'hover:text-ink'}>Поиск</NavLink>
          <NavLink to="/platforms" className={({ isActive }) => isActive ? 'text-ink' : 'hover:text-ink'}>Платформы</NavLink>
          <NavLink to="/library" className={({ isActive }) => isActive ? 'text-ink' : 'hover:text-ink'}>Полка</NavLink>
          <NavLink to="/guide" className={({ isActive }) => isActive ? 'text-ink' : 'hover:text-ink'}>Справочник</NavLink>
        </nav>
        <SearchBox />
        <AccountMenu />
      </div>
    </header>
  )
}

export function RatingBadge({ type, id, tmdbScore }: { type: MediaType; id: number; tmdbScore?: number }) {
  const [, setTick] = useState(0)
  useEffect(() => subscribeRatings(() => setTick((n) => n + 1)), [])
  useEffect(() => {
    ensureImdbRating(type, id).catch(() => undefined)
  }, [type, id])
  const cached = cachedRating(type, id)
  const label = cached.imdb || (tmdbScore ? tmdbScore.toFixed(1) : '')
  if (!label) return null
  return (
    <div className="absolute bottom-1.5 right-1.5 rounded-md bg-black/75 px-1.5 py-0.5 leading-none backdrop-blur-sm">
      <p className="font-mono text-sm font-bold text-[#f5c518]">{label}</p>
    </div>
  )
}

export function PersonLink({ id, name, className = '' }: { id: number; name: string; className?: string }) {
  return (
    <Link to={`/person/${id}`} className={`text-ink underline decoration-hairline underline-offset-4 hover:decoration-accent ${className}`}>
      {name}
    </Link>
  )
}

export function PosterCard({ item, type, layout = 'row' }: { item: TmdbItem; type?: MediaType; layout?: 'row' | 'grid' }) {
  const media = type ?? kindOf(item)
  const poster = posterUrl(item.poster_path)
  const year = yearOf(item.release_date || item.first_air_date)
  return (
    <Link to={`/title/${media}/${item.id}`} className={`group block ${layout === 'grid' ? 'w-full' : 'w-[42vw] shrink-0 sm:w-40'}`}>
      <div className="poster-hover relative overflow-hidden rounded-xl border border-hairline bg-card">
        {poster ? (
          <img src={poster} alt={titleOf(item)} className="aspect-[2/3] w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex aspect-[2/3] items-end p-3 text-sm text-mute">{titleOf(item)}</div>
        )}
        <RatingBadge type={media} id={item.id} tmdbScore={item.vote_average} />
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="line-clamp-2 text-sm leading-snug">{titleOf(item)}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
          {media === 'tv' ? 'сериал' : 'фильм'}{year ? ` · ${year}` : ''}
        </p>
      </div>
    </Link>
  )
}

export function Row({ title, items, type, to }: { title: string; items: TmdbItem[]; type?: MediaType; to?: string }) {
  if (!items.length) return null
  return (
    <section className="rise mb-10">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        {to ? <Link to={to} className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">Все</Link> : null}
      </div>
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {items.filter((i) => i.media_type !== 'person').map((item) => (
          <PosterCard key={`${kindOf(item)}-${item.id}`} item={item} type={type ?? kindOf(item)} />
        ))}
        {to ? (
          <Link to={to} className="flex w-[42vw] shrink-0 flex-col items-center justify-center rounded-xl border border-hairline bg-card text-center sm:w-40">
            <span className="text-2xl text-accent">→</span>
            <span className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">Ещё</span>
          </Link>
        ) : null}
      </div>
    </section>
  )
}

export function Grid({ items, type }: { items: TmdbItem[]; type?: MediaType }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.filter((i) => i.media_type !== 'person').map((item) => (
        <PosterCard key={`${kindOf(item)}-${item.id}`} item={item} type={type ?? kindOf(item)} layout="grid" />
      ))}
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return <p className="py-16 text-center text-sm text-mute">{text}</p>
}

export function PlatformChip({ id }: { id: number }) {
  const p = PLATFORMS.find((x) => x.id === id)
  if (!p) return null
  return (
    <Link to={`/platforms/${p.slug}`} className="inline-flex items-center gap-2 rounded-full border border-hairline bg-card px-3 py-1 text-xs text-mute hover:text-ink">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.tint }} />
      {p.name}
    </Link>
  )
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fn().then((res) => { if (alive) setData(res) }).catch((err: Error) => { if (alive) setError(err.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, deps)
  return { data, error, loading }
}

export function ErrorBox({ code }: { code: string }) {
  if (code === 'BAD_KEY') {
    return <div className="rounded-2xl border border-hairline bg-card p-6 text-sm text-mute">Не удалось подключить каталог TMDB.</div>
  }
  return <div className="rounded-2xl border border-hairline bg-card p-6 text-sm text-mute">Не удалось загрузить данные ({code}).</div>
}
