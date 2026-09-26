import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { firebaseDb } from './firebase'
import type { Account } from './auth'
import type { MediaType } from './tmdb'

export type CloudItem = {
  id: number
  type: MediaType
  title: string
  poster: string
  year: string
  status: string
  rating: number | null
  note: string
  season?: number
  episode?: number
  updatedAt: number
}

function itemId(item: Pick<CloudItem, 'type' | 'id'>) {
  return `${item.type}-${item.id}`
}

export async function saveProfile(account: Account) {
  await setDoc(doc(firebaseDb, 'users', account.sub), {
    email: account.email,
    name: account.name,
    picture: account.picture,
    updatedAt: Date.now(),
  }, { merge: true })
}

export async function pullLibrary(uid: string): Promise<CloudItem[]> {
  const snap = await getDocs(collection(firebaseDb, 'users', uid, 'library'))
  return snap.docs.map((row) => row.data() as CloudItem)
}

export async function pushItem(uid: string, item: CloudItem) {
  await setDoc(doc(firebaseDb, 'users', uid, 'library', itemId(item)), item, { merge: true })
}

export async function dropItem(uid: string, type: MediaType, id: number) {
  await deleteDoc(doc(firebaseDb, 'users', uid, 'library', `${type}-${id}`))
}

export function mergeLibraries<T extends CloudItem>(local: T[], remote: CloudItem[]) {
  const map = new Map<string, T>()
  local.forEach((item) => map.set(itemId(item), item))
  remote.forEach((item) => {
    const key = itemId(item)
    const prev = map.get(key)
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) map.set(key, item as T)
  })
  return [...map.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}
