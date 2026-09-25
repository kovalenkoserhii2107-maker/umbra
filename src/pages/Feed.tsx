import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Empty, ErrorBox, Grid } from '../components'
import { feedById, loadFeedPage, type FeedId } from '../lib/feeds'
import { useAppState } from '../state'
import type { TmdbItem } from '../lib/tmdb'

export function FeedPage() {
  const { id = '' } = useParams()
  const feed = feedById(id)
  const { items } = useAppState()
  const seed = items.find((x) => x.status === 'watched' || x.status === 'watchlist') || items[0]
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<TmdbItem[]>([])
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sentry = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setPage(1)
    setRows([])
    setDone(false)
  }, [id])

  useEffect(() => {
    if (!feed) return
    let alive = true
    setLoading(true)
    loadFeedPage(feed.id as FeedId, page, seed ? { type: seed.type, id: seed.id } : undefined)
      .then((data) => {
        if (!alive) return
        setRows((prev) => {
          const seen = new Set(prev.map((x) => `${x.media_type || feed.type}-${x.id}`))
          const next = data.results.filter((x) => !seen.has(`${x.media_type || feed.type}-${x.id}`))
          return [...prev, ...next]
        })
        if (page >= data.total_pages || data.results.length === 0) setDone(true)
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
  }, [feed?.id, page, seed?.id])

  useEffect(() => {
    if (!sentry.current || done) return
    const node = sentry.current
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loading) setPage((p) => p + 1)
    }, { rootMargin: '600px' })
    io.observe(node)
    return () => io.disconnect()
  }, [done, loading, rows.length])

  if (!feed) return <Empty text="Раздел не найден." />
  if (error && !rows.length) return <ErrorBox code={error} />

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">каталог</p>
      <h1 className="mt-1 text-3xl tracking-tight">{feed.title}</h1>
      <div className="mt-6">
        <Grid items={rows} type={feed.type} />
      </div>
      <div ref={sentry} className="h-10" />
      {loading ? <p className="py-6 text-center text-sm text-mute">Подгружаю ещё…</p> : null}
      {done && !loading ? <p className="py-6 text-center text-sm text-dim">Это все</p> : null}
    </div>
  )
}
