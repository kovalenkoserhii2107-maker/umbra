import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { applySearch } from '../lib/search'
import { catalog, profileUrl, type PersonHit } from '../lib/catalog'
import { kindOf, posterUrl, titleOf, tmdb, type TmdbItem } from '../lib/tmdb'

export function SearchBox() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [titles, setTitles] = useState<TmdbItem[]>([])
  const [people, setPeople] = useState<PersonHit[]>([])
  const root = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setTitles([])
      setPeople([])
      return
    }
    let alive = true
    const timer = window.setTimeout(() => {
      Promise.all([tmdb.searchCatalog(query, 1), catalog.people(query, 1)])
        .then(([found, persons]) => {
          if (!alive) return
          setTitles(applySearch(found.results, query, {
            kind: 'all', year: '', genre: null, minScore: 0, sort: 'relevance',
          }).slice(0, 6))
          setPeople(persons.results.slice(0, 4))
          setOpen(true)
        })
        .catch(() => undefined)
    }, 220)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [q])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (!query) return
    setOpen(false)
    navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  return (
    <form ref={root} onSubmit={onSubmit} className="relative ml-auto min-w-0 flex-1 max-w-sm">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (titles.length || people.length) setOpen(true) }}
        placeholder="Поиск"
        className="w-full rounded-full border border-hairline bg-card px-4 py-2 text-sm text-ink outline-none placeholder:text-dim focus:border-accent/60"
      />
      {open && (titles.length || people.length) ? (
        <div className="absolute right-0 z-50 mt-2 w-full overflow-hidden rounded-2xl border border-hairline bg-card shadow-[0_18px_50px_rgba(0,0,0,0.55)] sm:w-[380px]">
          {titles.map((item) => {
            const media = kindOf(item)
            return (
              <Link
                key={`${media}-${item.id}`}
                to={`/title/${media}/${item.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 hover:bg-white/5"
              >
                {item.poster_path ? <img src={posterUrl(item.poster_path, 'w92')} alt="" className="h-12 w-8 rounded object-cover" /> : <div className="h-12 w-8 rounded bg-canvas" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm">{titleOf(item)}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{media === 'tv' ? 'сериал' : 'фильм'}</span>
                </span>
              </Link>
            )
          })}
          {people.map((person) => (
            <Link key={person.id} to={`/person/${person.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5">
              {person.profile_path ? <img src={profileUrl(person.profile_path)} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-canvas" />}
              <span className="min-w-0">
                <span className="block truncate text-sm">{person.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{person.known_for_department || 'человек'}</span>
              </span>
            </Link>
          ))}
          <button type="submit" className="block w-full border-t border-hairline px-3 py-2 text-left text-xs text-accent">
            Все результаты
          </button>
        </div>
      ) : null}
    </form>
  )
}
