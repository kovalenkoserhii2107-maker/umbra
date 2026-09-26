import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { firebaseDb, firebaseAuth } from "./firebase";
import {
  itemKey,
  parseItem,
  type LibraryItem,
  type LibraryPatch,
} from "./library";
function owned(uid: string) {
  if (!uid || firebaseAuth.currentUser?.uid !== uid)
    throw new Error("Сессия изменилась. Войди снова.");
}
export function watchLibrary(
  uid: string,
  receive: (items: LibraryItem[], pending: boolean, cached: boolean) => void,
  failed: (error: Error) => void,
) {
  owned(uid);
  return onSnapshot(
    collection(firebaseDb, "users", uid, "library"),
    { includeMetadataChanges: true },
    (snap) => {
      try {
        const items = snap.docs
          .map((row) => {
            const data = row.data({ serverTimestamps: "estimate" });
            const updatedAt =
              typeof data.updatedAt === "number"
                ? data.updatedAt
                : data.updatedAt?.toMillis?.() || 0;
            return parseItem({ ...data, updatedAt });
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);
        receive(items, snap.metadata.hasPendingWrites, snap.metadata.fromCache);
      } catch {
        failed(
          new Error(
            "В облаке есть некорректная запись. Экспортируй полку перед восстановлением.",
          ),
        );
      }
    },
    failed,
  );
}
export async function pushItem(uid: string, value: LibraryItem) {
  owned(uid);
  const item = parseItem(value);
  await setDoc(doc(firebaseDb, "users", uid, "library", itemKey(item)), {
    ...item,
    updatedAt: serverTimestamp(),
  });
}
export async function patchItem(
  uid: string,
  type: LibraryItem["type"],
  id: number,
  patch: LibraryPatch,
) {
  owned(uid);
  // updateDoc cannot recreate a title deleted on another device.
  await updateDoc(doc(firebaseDb, "users", uid, "library", `${type}-${id}`), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
export async function dropItem(
  uid: string,
  type: LibraryItem["type"],
  id: number,
) {
  owned(uid);
  await deleteDoc(doc(firebaseDb, "users", uid, "library", `${type}-${id}`));
}
export async function importItems(uid: string, items: LibraryItem[]) {
  owned(uid);
  // Small atomic chunks keep imports below Firestore request limits.
  for (let start = 0; start < items.length; start += 100) {
    owned(uid);
    const batch = writeBatch(firebaseDb);
    for (const item of items.slice(start, start + 100))
      batch.set(doc(firebaseDb, "users", uid, "library", itemKey(item)), {
        ...parseItem(item),
        updatedAt: serverTimestamp(),
      });
    await batch.commit();
  }
}
