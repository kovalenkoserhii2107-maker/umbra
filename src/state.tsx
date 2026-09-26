import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_TMDB_KEY, type MediaType } from './lib/tmdb'
import { cloudUid, loadAccount, subscribeAccount, type Account } from './lib/auth'
import { dropItem, mergeLibraries, pullLibrary, pushItem, saveProfile } from './lib/cloud'

export type Status = 'watchlist' | 'watching' | 'watched' | 'dropped'

export type LibraryItem = {
  id: number
  type: MediaType
  title: string
  poster: string
  year: string
  status: Status
  rating: number | null
  note: string
  season?: number
  episode?: number
  updatedAt: number
}

export type Settings = {
  tmdbKey: string
  region: string
  subscribed: number[]
}

const SETTINGS_KEY = 'umbra.settings'
const LIBRARY_KEY = 'umbra.library'
const LEGACY_KEY = 'umbra.tmdbKey'

const defaultSettings: Settings = {
  tmdbKey: localStorage.getItem(LEGACY_KEY) || DEFAULT_TMDB_KEY,
  region: 'UA',
  subscribed: [8, 337, 9, 1899, 350, 192],
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...defaultSettings }
    const parsed = JSON.parse(raw) as Settings
    return {
      ...defaultSettings,
      ...parsed,
      tmdbKey: parsed.tmdbKey || DEFAULT_TMDB_KEY,
    }
  } catch {
    return { ...defaultSettings }
  }
}

function loadLibrary(): LibraryItem[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    return raw ? (JSON.parse(raw) as LibraryItem[]) : []
  } catch {
    return []
  }
}

type Ctx = {
  settings: Settings
  setSettings: (patch: Partial<Settings>) => void
  items: LibraryItem[]
  upsert: (item: Omit<LibraryItem, 'updatedAt'> & { updatedAt?: number }) => void
  remove: (type: MediaType, id: number) => void
  get: (type: MediaType, id: number) => LibraryItem | undefined
  exportJson: () => string
  importJson: (raw: string) => void
}

const AppState = createContext<Ctx | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings())
  const [items, setItems] = useState<LibraryItem[]>(() => loadLibrary())
  const [account, setAccount] = useState<Account | null>(() => loadAccount())

  useEffect(() => subscribeAccount(() => setAccount(loadAccount())), [])

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    if (settings.tmdbKey) localStorage.setItem(LEGACY_KEY, settings.tmdbKey)
    else localStorage.removeItem(LEGACY_KEY)
  }, [settings])

  useEffect(() => {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items))
  }, [items])

  useEffect(() => {
    const uid = cloudUid()
    if (!account || !uid) return
    let alive = true
    saveProfile(account).catch(() => undefined)
    pullLibrary(uid)
      .then((remote) => {
        if (!alive) return
        setItems((local) => {
          const merged = mergeLibraries(local, remote)
          merged.forEach((item) => pushItem(uid, item).catch(() => undefined))
          return merged
        })
      })
      .catch(() => undefined)
    return () => { alive = false }
  }, [account?.sub])

  const value = useMemo<Ctx>(() => ({
    settings,
    setSettings: (patch) => setSettingsState((s) => ({ ...s, ...patch })),
    items,
    upsert: (item) => {
      const next: LibraryItem = { ...item, updatedAt: Date.now() }
      setItems((list) => {
        const idx = list.findIndex((x) => x.id === next.id && x.type === next.type)
        if (idx === -1) return [next, ...list]
        const copy = list.slice()
        copy[idx] = { ...copy[idx], ...next }
        return copy
      })
      const uid = cloudUid()
      if (uid) pushItem(uid, next).catch(() => undefined)
    },
    remove: (type, id) => {
      setItems((list) => list.filter((x) => !(x.id === id && x.type === type)))
      const uid = cloudUid()
      if (uid) dropItem(uid, type, id).catch(() => undefined)
    },
    get: (type, id) => items.find((x) => x.id === id && x.type === type),
    exportJson: () => JSON.stringify({ settings: { region: settings.region, subscribed: settings.subscribed }, items }, null, 2),
    importJson: (raw) => {
      const data = JSON.parse(raw) as { items?: LibraryItem[] }
      if (Array.isArray(data.items)) setItems(data.items)
    },
  }), [settings, items, account])

  return <AppState.Provider value={value}>{children}</AppState.Provider>
}

export function useAppState() {
  const ctx = useContext(AppState)
  if (!ctx) throw new Error('AppState missing')
  return ctx
}
