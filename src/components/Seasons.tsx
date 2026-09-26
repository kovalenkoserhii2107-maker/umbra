import { useEffect, useMemo, useState } from 'react'
import { dateLabel } from '../lib/format'
import { fetchImdbRatings } from '../lib/ratings'
import { tvApi, type EpisodeInfo, type EpisodeRef, type SeasonInfo } from '../lib/tv'

function tone(score?: string | null) {
  const n = Number(score)
  if (!n) return 'bg-hairline text-dim'
  if (n >= 8.5) return 'bg-[#9ece6a]/20 text-[#9ece6a]'
  if (n >= 7.5) return 'bg-[#f5c518]/20 text-[#f5c518]'
  if (n >= 6.5) return 'bg-accent/20 text-accent'
  return 'bg-white/5 text-mute'
}

function barHeight(score?: string | null) {
  const n = Number(score)
  if (!n) return 10
  return Math.max(10, Math.round((n / 10) * 72))
}

function barFill(score?: string | null) {
  const n = Number(score)
  if (!n) return 'linear-gradient(180deg, #3a3a3a, #1a1a1a)'
  if (n >= 8.5) return 'linear-gradient(180deg, #d4f0a8, #9ece6a 45%, #6a9a3a)'
  if (n >= 7.5) return 'linear-gradient(180deg, #ffe58a, #f5c518 50%, #ff9e64)'
  if (n >= 6.5) return 'linear-gradient(180deg, #ffc9a0, #ff9e64 55%, #d9783a)'
  return 'linear-gradient(180deg, #c9c9c9, #7a7a7a 60%, #4a4a4a)'
}

export function Seasons({ tvId, seasons, nextEpisode, lastEpisode }: {
  tvId: number
  seasons?: SeasonInfo[]
  nextEpisode?: EpisodeRef | null
  lastEpisode?: EpisodeRef | null
}) {
  const regular = (seasons || []).filter((s) => s.season_number > 0)
  const first = regular[0]?.season_number || 1
  const [current, setCurrent] = useState(first)
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (regular[0] && current !== first && episodes.length === 0) setCurrent(first)
  }, [first])

  useEffect(() => {
    if (!tvId || !current) return
    let alive = true
    setLoading(true)
    setEpisodes([])
    tvApi.season(tvId, current)
      .then(async (pack) => {
        const list = pack.episodes || []
        if (!alive) return
        setEpisodes(list)
        setLoading(false)
        const ids = await Promise.all(list.map(async (ep) => {
          try {
            const ext = await tvApi.episodeImdb(tvId, current, ep.episode_number)
            return { key: ep.id, imdbId: ext.imdb_id }
          } catch {
            return { key: ep.id, imdbId: undefined as string | undefined }
          }
        }))
        const scores = await fetchImdbRatings(ids.map((row) => row.imdbId || '').filter(Boolean))
        if (!alive) return
        const byId = new Map(ids.map((row) => [row.key, row.imdbId]))
        setEpisodes((prev) => prev.map((ep) => {
          const imdbId = byId.get(ep.id)
          return { ...ep, imdbId, imdb: imdbId ? scores[imdbId] || null : null }
        }))
      })
      .catch(() => {
        if (alive) {
          setEpisodes([])
          setLoading(false)
        }
      })
    return () => { alive = false }
  }, [tvId, current])

  const rated = useMemo(() => episodes.map((ep) => Number(ep.imdb)).filter((n) => n > 0), [episodes])
  const min = rated.length ? Math.min(...rated) : 0
  const max = rated.length ? Math.max(...rated) : 0

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg tracking-tight">Сезоны и серии</h2>
          {nextEpisode ? (
            <p className="mt-1 text-sm text-mute">
              Следующая: S{nextEpisode.season_number}E{nextEpisode.episode_number} {nextEpisode.name}
              {nextEpisode.air_date ? ` · ${dateLabel(nextEpisode.air_date)}` : ''}
            </p>
          ) : lastEpisode ? (
            <p className="mt-1 text-sm text-mute">
              Последняя: S{lastEpisode.season_number}E{lastEpisode.episode_number} {lastEpisode.name}
              {lastEpisode.air_date ? ` · ${dateLabel(lastEpisode.air_date)}` : ''}
            </p>
          ) : null}
        </div>
        {rated.length ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
            IMDb {min.toFixed(1)} – {max.toFixed(1)}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {regular.map((season) => (
          <button
            key={season.id}
            onClick={() => setCurrent(season.season_number)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
              current === season.season_number ? 'border-ink bg-ink text-canvas' : 'border-hairline text-mute'
            }`}
          >
            S{season.season_number}
            {season.air_date ? ` · ${dateLabel(season.air_date).split(' ').slice(-1)}` : ''}
          </button>
        ))}
      </div>

      {loading ? <p className="mt-4 text-sm text-mute">Загружаю первый сезон…</p> : null}

      {episodes.length ? (
        <>
          <div className="mt-5 flex items-end gap-1.5 overflow-x-auto rounded-2xl border border-hairline bg-card px-3 pb-2 pt-4">
            {episodes.map((ep) => (
              <div key={ep.id} className="flex w-8 shrink-0 flex-col items-center gap-1" title={`${ep.episode_number}. ${ep.name} ${ep.imdb || ''}`}>
                <span className="font-mono text-[9px] text-[#f5c518]">{ep.imdb || '—'}</span>
                <div className="flex h-[72px] w-full items-end justify-center">
                  <div
                    className="w-3.5 rounded-t-md"
                    style={{ height: barHeight(ep.imdb), background: barFill(ep.imdb) }}
                  />
                </div>
                <span className="font-mono text-[9px] text-dim">{ep.episode_number}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {episodes.map((ep) => (
              <div key={ep.id} className="flex items-start justify-between gap-3 rounded-2xl border border-hairline bg-card px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-mono text-dim">E{ep.episode_number}</span>
                    <span className="ml-2">{ep.name}</span>
                  </p>
                  <p className="mt-1 text-xs text-mute">
                    {ep.air_date ? dateLabel(ep.air_date) : 'Дата не указана'}
                    {ep.runtime ? ` · ${ep.runtime} мин` : ''}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-sm font-bold ${tone(ep.imdb)}`}>
                  {ep.imdb || '—'}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
