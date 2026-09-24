import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBox, NeedKey, PersonLink, PlatformChip, PosterCard, RatingBadge, useAsync } from '../components'
import { backdropUrl, hasApiKey, kindOf, posterUrl, titleOf, tmdb, type MediaType } from '../lib/tmdb'
import { fetchImdbRating, rememberRating } from '../lib/ratings'
import { runtimeLabel, yearOf } from '../lib/format'
import { PLATFORMS } from '../lib/providers'
import { useAppState, type Status } from '../state'

const STATUSES: Array<{ id: Status; label: string }> = [
  { id: 'watchlist', label: 'Хочу' },
  { id: 'watching', label: 'Смотрю' },
  { id: 'watched', label: 'Видел' },
  { id: 'dropped', label: 'Бросил' },
]

export function TitlePage() {
  const { type = 'movie', id = '' } = useParams()
  const media = (type === 'tv' ? 'tv' : 'movie') as MediaType
  const { settings, get, upsert, remove } = useAppState()
  const ready = hasApiKey()
  const query = useAsync(() => tmdb.details(media, Number(id)), [media, id, settings.tmdbKey])
  const mine = get(media, Number(id))
  const [imdb, setImdb] = useState<string | null>(null)

  useEffect(() => {
    const item = query.data
    if (!item) return
    if (item.vote_average) rememberRating(media, item.id, { tmdb: item.vote_average })
    const imdbId = item.external_ids?.imdb_id
    if (!imdbId) return
    fetchImdbRating(imdbId).then((value) => {
      if (!value) return
      setImdb(value)
      rememberRating(media, item.id, { imdb: value })
    }).catch(() => undefined)
  }, [query.data, media])

  if (!ready) return <NeedKey />
  if (query.error) return <ErrorBox code={query.error} />
  if (query.loading || !query.data) return <p className="text-sm text-mute">Собираю карточку…</p>

  const item = query.data
  const title = titleOf(item)
  const year = yearOf(item.release_date || item.first_air_date)
  const runtime = item.runtime || item.episode_run_time?.[0]
  const trailer =
    item.videos?.results.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
    item.videos?.results.find((v) => v.site === 'YouTube')
  const directors = (item.credits?.crew || []).filter((c) => c.job === 'Director')
  const creators = item.created_by || []
  const region = item['watch/providers']?.results[settings.region] || item['watch/providers']?.results.US
  const flatrate = region?.flatrate ?? []
  const knownIds = new Set(PLATFORMS.map((p) => p.id))
  const score = imdb || (item.vote_average ? item.vote_average.toFixed(1) : '')

  function setStatus(status: Status) {
    upsert({
      id: Number(id),
      type: media,
      title,
      poster: posterUrl(item.poster_path, 'w185'),
      year,
      status,
      rating: mine?.rating ?? null,
      note: mine?.note ?? '',
      season: mine?.season,
      episode: mine?.episode,
    })
  }

  return (
    <article className="rise pb-8">
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-hairline">
        {item.backdrop_path ? (
          <img src={backdropUrl(item.backdrop_path)} alt="" className="h-56 w-full object-cover sm:h-80" />
        ) : (
          <div className="h-40 bg-card sm:h-56" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />
        <div className="absolute bottom-0 flex items-end gap-4 p-4 sm:p-6">
          {item.poster_path ? (
            <div className="relative hidden w-24 overflow-hidden rounded-xl border border-hairline sm:block">
              <img src={posterUrl(item.poster_path, 'w185')} alt="" className="w-full" />
              <RatingBadge type={media} id={item.id} tmdbScore={item.vote_average} />
            </div>
          ) : null}
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              {media === 'tv' ? 'сериал' : 'фильм'} {year ? `· ${year}` : ''}
            </p>
            <h1 className="mt-1 text-3xl tracking-tight sm:text-4xl">{title}</h1>
            {item.tagline ? <p className="mt-1 text-sm text-mute">{item.tagline}</p> : null}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-hairline bg-card p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative w-28 shrink-0 overflow-hidden rounded-xl border border-hairline sm:hidden">
            {item.poster_path ? <img src={posterUrl(item.poster_path, 'w185')} alt="" className="w-full" /> : <div className="aspect-[2/3] bg-canvas" />}
            <RatingBadge type={media} id={item.id} tmdbScore={item.vote_average} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">режиссёр</p>
            {directors.length ? (
              <p className="mt-1 text-lg">
                {directors.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 ? ', ' : ''}
                    <PersonLink id={d.id} name={d.name} />
                  </span>
                ))}
              </p>
            ) : creators.length ? (
              <p className="mt-1 text-lg">
                {creators.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 ? ', ' : ''}
                    <PersonLink id={d.id} name={d.name} />
                  </span>
                ))}
                <span className="ml-2 font-mono text-[11px] uppercase text-dim">создатели</span>
              </p>
            ) : (
              <p className="mt-1 text-mute">Режиссёр не указан в TMDB</p>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-mute">
              {score ? <span className="font-mono text-base font-bold text-[#f5c518]">{score}</span> : null}
              {runtime ? <span>{runtimeLabel(runtime)}</span> : null}
              {item.number_of_seasons ? <span>{item.number_of_seasons} сез.</span> : null}
              {item.external_ids?.imdb_id ? (
                <a className="text-accent" href={`https://www.imdb.com/title/${item.external_ids.imdb_id}/`} target="_blank" rel="noreferrer">
                  открыть IMDb
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {item.overview ? <p className="mt-5 max-w-3xl text-[15px] leading-7 text-ink/90">{item.overview}</p> : null}

      <section className="mt-8 rounded-2xl border border-hairline bg-card p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">на полке</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button key={s.id} onClick={() => setStatus(s.id)} className={`rounded-full border px-3 py-1.5 text-sm ${mine?.status === s.id ? 'border-ink bg-ink text-canvas' : 'border-hairline text-mute'}`}>
              {s.label}
            </button>
          ))}
          {mine ? <button onClick={() => remove(media, Number(id))} className="rounded-full px-3 py-1.5 text-sm text-dim">убрать</button> : null}
        </div>
        {mine ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr]">
            <label className="text-sm text-mute">
              Оценка
              <input type="number" min={1} max={10} value={mine.rating ?? ''} onChange={(e) => upsert({ ...mine, rating: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full rounded-xl border border-hairline bg-canvas px-3 py-2 text-ink outline-none" />
            </label>
            <label className="text-sm text-mute">
              Заметка
              <input value={mine.note} onChange={(e) => upsert({ ...mine, note: e.target.value })} className="mt-1 w-full rounded-xl border border-hairline bg-canvas px-3 py-2 text-ink outline-none" placeholder="Коротко, для себя" />
            </label>
          </div>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-lg tracking-tight">Где смотреть · {settings.region}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {flatrate.length ? flatrate.map((p) => knownIds.has(p.provider_id) ? (
            <PlatformChip key={p.provider_id} id={p.provider_id} />
          ) : (
            <span key={p.provider_id} className="rounded-full border border-hairline px-3 py-1 text-xs text-mute">{p.provider_name}</span>
          )) : (
            <p className="text-sm text-mute">В этом регионе подписка не найдена. Смени регион в настройках.</p>
          )}
        </div>
      </section>

      {trailer ? (
        <section className="mt-8">
          <h2 className="text-lg tracking-tight">Трейлер</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-hairline">
            <iframe title={trailer.name} className="aspect-video w-full" src={`https://www.youtube.com/embed/${trailer.key}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        </section>
      ) : null}

      {item.credits?.cast?.length ? (
        <section className="mt-8">
          <h2 className="text-lg tracking-tight">Актёры</h2>
          <div className="row-scroll mt-3 flex gap-3 overflow-x-auto pb-2">
            {item.credits.cast.slice(0, 16).map((c) => (
              <Link key={c.id} to={`/person/${c.id}`} className="w-28 shrink-0">
                {c.profile_path ? <img src={posterUrl(c.profile_path, 'w185')} alt="" className="aspect-[2/3] w-full rounded-xl object-cover" /> : <div className="aspect-[2/3] rounded-xl border border-hairline bg-card" />}
                <p className="mt-1 line-clamp-2 text-sm">{c.name}</p>
                <p className="line-clamp-1 font-mono text-[10px] text-dim">{c.character}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {item.similar?.results?.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg tracking-tight">Похожее</h2>
          <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
            {item.similar.results.slice(0, 12).map((s) => (
              <PosterCard key={s.id} item={s} type={kindOf({ ...s, media_type: media })} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  )
}
