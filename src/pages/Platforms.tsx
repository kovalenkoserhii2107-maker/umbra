import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { ErrorBox, Grid, useAsync } from '../components'
import { PLATFORMS, platformBySlug } from '../lib/providers'
import { tmdb, type TmdbItem, type TmdbPage } from '../lib/tmdb'
import { useAppState } from '../state'

export function PlatformsPage() {
  const { settings } = useAppState()
  const list = PLATFORMS.filter((p) => settings.subscribed.includes(p.id))
  const shown = list.length ? list : PLATFORMS

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">платформы</p>
      <h1 className="mt-1 text-3xl tracking-tight">Где смотреть</h1>
      <p className="mt-2 max-w-xl text-sm text-mute">
        Каталоги глобальных сервисов по региону {settings.region}. Состав подписок меняется в настройках.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {shown.map((p) => (
          <Link key={p.id} to={`/platforms/${p.slug}`} className="group rounded-2xl border border-hairline bg-card p-5 transition hover:border-accent/40">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[0.16em] text-dim">{p.short}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: p.tint }} />
            </div>
            <h2 className="mt-6 text-2xl tracking-tight">{p.name}</h2>
            <p className="mt-1 text-sm text-mute">Фильмы и сериалы сервиса</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function PlatformPage() {
  const { slug = '' } = useParams()
  const platform = platformBySlug(slug)
  const { settings } = useAppState()
  const [tab, setTab] = useState<'movie' | 'tv'>('movie')

  const query = useAsync<TmdbPage<TmdbItem>>(
    () => {
      if (!platform) {
        return Promise.resolve({ page: 1, results: [], total_pages: 0, total_results: 0 })
      }
      return tmdb.discover(tab, platform.id, settings.region)
    },
    [platform?.id, tab, settings.region],
  )

  if (!platform) return <p className="text-sm text-mute">Платформа не найдена.</p>
  if (query.error) return <ErrorBox code={query.error} />

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">{platform.short}</p>
      <h1 className="mt-1 text-3xl tracking-tight">{platform.name}</h1>
      <p className="mt-2 text-sm text-mute">Регион доступности: {settings.region}</p>
      <div className="mt-6 mb-6 flex gap-2">
        {(['movie', 'tv'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] ${
              tab === t ? 'border-ink bg-ink text-canvas' : 'border-hairline text-mute'
            }`}
          >
            {t === 'movie' ? 'Фильмы' : 'Сериалы'}
          </button>
        ))}
      </div>
      {query.loading ? <p className="text-sm text-mute">Загрузка каталога…</p> : <Grid items={query.data?.results ?? []} type={tab} />}
    </div>
  )
}
