import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { firebaseDb } from './firebase'
import type { Account } from './auth'
import type { LibraryItem } from '../state'

function itemId(item: Pick<LibraryItem, 'type' | 'id'>) {
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

export async function pullLibrary(uid: string): Promise<LibraryItem[]> {
  const snap = await getDocs(collection(firebaseDb, 'users', uid, 'library'))
  return snap.docs.map((row) => row.data() as LibraryItem)
}

export async function pushItem(uid: string, item: LibraryItem) {
  await setDoc(doc(firebaseDb, 'users', uid, 'library', itemId(item)), item, { merge: true })
}

export async function dropItem(uid: string, type: LibraryItem['type'], id: number) {
  await deleteDoc(doc(firebaseDb, 'users', uid, 'library', `${type}-${id}`))
}

export function mergeLibraries(local: LibraryItem[], remote: LibraryItem[]) {
  const map = new Map<string, LibraryItem>()
  ;[...local, ...remote].forEach((item) => {
    const key = itemId(item)
    const prev = map.get(key)
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) map.set(key, item)
  })
  return [...map.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}
