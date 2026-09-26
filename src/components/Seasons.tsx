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
  if (!n) return 8
  return Math.max(8, Math.round((n / 10) * 56))
}

export function Seasons({ tvId, seasons, nextEpisode, lastEpisode }: {
  tvId: number
  seasons?: SeasonInfo[]
  nextEpisode?: EpisodeRef | null
  lastEpisode?: EpisodeRef | null
}) {
  const regular = (seasons || []).filter((s) => s.season_number > 0)
  const [current, setCurrent] = useState(regular.at(-1)?.season_number || regular[0]?.season_number || 1)
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tvId || !current) return
    let alive = true
    setLoading(true)
    tvApi.season(tvId, current)
      .then(async (pack) => {
        const list = pack.episodes || []
        const ids = await Promise.all(list.map(async (ep) => {
          try {
            const ext = await tvApi.episodeImdb(tvId, current, ep.episode_number)
            return { ...ep, imdbId: ext.imdb_id }
          } catch {
            return ep
          }
        }))
        const scores = await fetchImdbRatings(ids.map((ep) => ep.imdbId || '').filter(Boolean))
        if (!alive) return
        setEpisodes(ids.map((ep) => ({ ...ep, imdb: ep.imdbId ? scores[ep.imdbId] || null : null })))
      })
      .catch(() => {
        if (alive) setEpisodes([])
      })
      .finally(() => {
        if (alive) setLoading(false)
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

      {loading ? <p className="mt-4 text-sm text-mute">Собираю серии и рейтинги IMDb…</p> : null}

      {episodes.length ? (
        <>
          <div className="mt-5 flex items-end gap-1 overflow-x-auto rounded-2xl border border-hairline bg-card px-3 pb-2 pt-4">
            {episodes.map((ep) => (
              <div key={ep.id} className="flex w-7 shrink-0 flex-col items-center gap-1" title={`${ep.episode_number}. ${ep.name} ${ep.imdb || ''}`}>
                <span className="font-mono text-[9px] text-[#f5c518]">{ep.imdb || '—'}</span>
                <div className="flex h-14 w-full items-end justify-center">
                  <div className={`w-3 rounded-sm ${ep.imdb ? 'bg-[#f5c518]' : 'bg-hairline'}`} style={{ height: barHeight(ep.imdb) }} />
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
