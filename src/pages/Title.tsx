import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBox, PlatformChip, PosterCard, useAsync } from '../components'
import { Seasons } from '../components/Seasons'
import { backdropUrl, kindOf, posterUrl, titleOf, tmdb, type MediaType, type PersonRef } from '../lib/tmdb'
import { fetchImdbRating, rememberRating } from '../lib/ratings'
import { dateLabel, runtimeLabel, yearOf } from '../lib/format'
import { PLATFORMS } from '../lib/providers'
import { useAppState, type Status } from '../state'
import type { EpisodeRef, SeasonInfo } from '../lib/tv'

const STATUSES: Array<{ id: Status; label: string }> = [
  { id: 'watchlist', label: 'Хочу' },
  { id: 'watching', label: 'Смотрю' },
  { id: 'watched', label: 'Видел' },
  { id: 'dropped', label: 'Бросил' },
]

const PRODUCER_JOBS = new Set(['Producer', 'Executive Producer'])
const WRITER_JOBS = new Set(['Writer', 'Screenplay', 'Story', 'Teleplay', 'Series Composition'])

function uniquePeople(list: PersonRef[]) {
  const seen = new Set<number>()
  return list.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

function PersonCard({ person, role }: { person: PersonRef; role: string }) {
  return (
    <Link to={`/person/${person.id}`} className="w-28 shrink-0">
      {person.profile_path ? (
        <img src={posterUrl(person.profile_path, 'w185')} alt="" className="aspect-[2/3] w-full rounded-xl object-cover" />
      ) : (
        <div className="aspect-[2/3] rounded-xl border border-hairline bg-card" />
      )}
      <p className="mt-1 line-clamp-2 text-sm">{person.name}</p>
      <p className="line-clamp-1 font-mono text-[10px] text-dim">{role}</p>
    </Link>
  )
}

function CrewColumn({ title, people, role }: { title: string; people: PersonRef[]; role: string }) {
  return (
    <div className="min-w-0 flex-1">
      <h2 className="text-lg tracking-tight">{title}</h2>
      <div className="row-scroll mt-3 flex gap-3 overflow-x-auto pb-2">
        {people.length ? people.slice(0, 6).map((p) => (
          <PersonCard key={`${role}-${p.id}`} person={p} role={role} />
        )) : (
          <p className="text-sm text-mute">Не указан</p>
        )}
      </div>
    </div>
  )
}

export function TitlePage() {
  const { type = 'movie', id = '' } = useParams()
  const media = (type === 'tv' ? 'tv' : 'movie') as MediaType
  const { settings, get, upsert, remove } = useAppState()
  const query = useAsync(() => tmdb.details(media, Number(id)), [media, id])
  const mine = get(media, Number(id))
  const [imdb, setImdb] = useState<string | null>(null)

  useEffect(() => {
    const item = query.data
    if (!item) return
    const imdbId = item.external_ids?.imdb_id
    if (!imdbId) return
    fetchImdbRating(imdbId).then((value) => {
      if (!value) return
      setImdb(value)
      rememberRating(media, item.id, { imdb: value })
    }).catch(() => undefined)
  }, [query.data, media])

  if (query.error) return <ErrorBox code={query.error} />
  if (query.loading || !query.data) return <p className="text-sm text-mute">Собираю карточку…</p>

  const item = query.data as typeof query.data & {
    seasons?: SeasonInfo[]
    next_episode_to_air?: EpisodeRef | null
    last_episode_to_air?: EpisodeRef | null
  }
  const title = titleOf(item)
  const released = item.release_date || item.first_air_date
  const year = yearOf(released)
  const releasedOn = dateLabel(released)
  const runtime = item.runtime || item.episode_run_time?.[0]
  const trailer =
    item.videos?.results.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
    item.videos?.results.find((v) => v.site === 'YouTube')
  const crew = item.credits?.crew || []
  const directors = uniquePeople([
    ...crew.filter((c) => c.job === 'Director'),
    ...(item.created_by || []),
  ])
  const producers = uniquePeople(crew.filter((c) => c.job && PRODUCER_JOBS.has(c.job)))
  const writers = uniquePeople(crew.filter((c) => c.job && WRITER_JOBS.has(c.job)))
  const region = item['watch/providers']?.results[settings.region] || item['watch/providers']?.results.US
  const flatrate = region?.flatrate ?? []
  const knownIds = new Set(PLATFORMS.map((p) => p.id))
  const score = imdb || ''

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
      <div className="mb-6 overflow-hidden rounded-3xl border border-hairline bg-card">
        {item.backdrop_path ? (
          <img src={backdropUrl(item.backdrop_path)} alt="" className="h-44 w-full object-cover sm:h-64" />
        ) : (
          <div className="h-28 bg-canvas sm:h-40" />
        )}
        <div className="p-4 sm:p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
            {media === 'tv' ? 'сериал' : 'фильм'}
            {releasedOn ? ` · ${media === 'tv' ? 'премьера' : 'выход'} ${releasedOn}` : ''}
          </p>
          <h1 className="mt-1 text-2xl tracking-tight sm:text-4xl">{title}</h1>
          {item.tagline ? <p className="mt-1 text-sm text-mute">{item.tagline}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
            {score ? <span className="font-mono text-base font-bold text-[#f5c518]">{score}</span> : null}
            {runtime ? <span>{runtimeLabel(runtime)}</span> : null}
            {item.number_of_seasons ? <span>{item.number_of_seasons} сез.</span> : null}
            {item.number_of_episodes ? <span>{item.number_of_episodes} эп.</span> : null}
          </div>
          {item.genres?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.genres.map((g) => (
                <span key={g.id} className="rounded-full border border-hairline px-2.5 py-1 text-xs text-mute">{g.name}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {item.overview ? <p className="max-w-3xl text-[15px] leading-7 text-ink/90">{item.overview}</p> : null}

      {media === 'tv' ? (
        <Seasons
          tvId={item.id}
          seasons={item.seasons}
          nextEpisode={item.next_episode_to_air}
          lastEpisode={item.last_episode_to_air}
        />
      ) : null}

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

      <section className="mt-8">
        <div className="grid gap-6 md:grid-cols-3">
          <CrewColumn title="Режиссёр" people={directors} role="режиссёр" />
          <CrewColumn title="Продюсер" people={producers} role="продюсер" />
          <CrewColumn title="Сценарист" people={writers} role="сценарист" />
        </div>
      </section>

      {item.credits?.cast?.length ? (
        <section className="mt-8">
          <h2 className="text-lg tracking-tight">Актёры</h2>
          <div className="row-scroll mt-3 flex gap-3 overflow-x-auto pb-2">
            {item.credits.cast.slice(0, 16).map((c) => (
              <PersonCard key={c.id} person={c} role={c.character || 'роль'} />
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
