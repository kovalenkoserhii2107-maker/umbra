import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "./firebase";
import { itemKey, type LibraryItem } from "./library";
import type { MediaType } from "./tmdb";

/**
 * Friends see a copy of the owner's statuses and ratings, never notes:
 * profiles/{uid}/ratings/{type-id}. Firestore rules let a person read it only
 * when the owner has added them to users/{owner}/friends.
 */
export type Person = { uid: string; name: string; picture: string };
export type SharedRating = Pick<
  LibraryItem,
  | "id"
  | "type"
  | "title"
  | "poster"
  | "year"
  | "status"
  | "rating"
  | "season"
  | "episode"
  | "updatedAt"
>;

function me() {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) throw new Error("Увійди в акаунт.");
  return uid;
}

function person(uid: string, data: Record<string, unknown>): Person {
  return {
    uid,
    name: typeof data.name === "string" && data.name ? data.name : "Без імені",
    picture: typeof data.picture === "string" ? data.picture : "",
  };
}

export function friendsError(error: unknown) {
  const code = (error as { code?: string })?.code || "";
  if (code === "permission-denied")
    return "Друзі поки недоступні: немає доступу до даних. Якщо ти власник застосунку, опублікуй нові правила Firestore.";
  if (code === "unavailable") return "Немає зв'язку. Повтори пізніше.";
  return "Не вдалося виконати дію. Повтори спробу.";
}

/** Public card that invite links show: name and picture only. */
export async function publishProfile(name: string, picture: string) {
  const uid = me();
  await setDoc(doc(firebaseDb, "profiles", uid), {
    name: name.slice(0, 100),
    picture: picture.slice(0, 2048),
    updatedAt: serverTimestamp(),
  });
}

export async function loadProfile(uid: string): Promise<Person | null> {
  const snap = await getDoc(doc(firebaseDb, "profiles", uid));
  return snap.exists() ? person(uid, snap.data()) : null;
}

/** Accept an invite: I share with them and ask them to share back. */
export async function sendRequest(target: Person, mine: Omit<Person, "uid">) {
  const uid = me();
  if (uid === target.uid) throw new Error("Це твоє власне посилання.");
  const batch = writeBatch(firebaseDb);
  batch.set(doc(firebaseDb, "users", uid, "friends", target.uid), {
    name: target.name.slice(0, 100),
    picture: target.picture.slice(0, 2048),
    since: serverTimestamp(),
  });
  batch.set(doc(firebaseDb, "users", target.uid, "requests", uid), {
    name: mine.name.slice(0, 100),
    picture: mine.picture.slice(0, 2048),
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

/** An invite key: 24 letters and digits, part of my invite link. */
export const INVITE_TOKEN = /^[A-Za-z0-9]{24}$/;

function newInviteToken() {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  while (out.length < 24) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    for (const b of bytes) {
      if (b < 248 && out.length < 24) out += abc[b % 62];
    }
  }
  return out;
}

/**
 * My invite key, made on first use. Whoever has a link with it may add
 * themselves to my friends straight away (Firestore rules check the key).
 */
export async function myInviteToken(): Promise<string> {
  const uid = me();
  const snap = await getDocs(collection(firebaseDb, "users", uid, "invites"));
  const found = snap.docs.find((d) => INVITE_TOKEN.test(d.id));
  if (found) return found.id;
  const token = newInviteToken();
  await setDoc(doc(firebaseDb, "users", uid, "invites", token), {
    createdAt: serverTimestamp(),
  });
  return token;
}

/** Opening a friend's invite link: we become friends both ways at once. */
export async function acceptInvite(
  inviter: Person,
  token: string,
  mine: Omit<Person, "uid">,
) {
  const uid = me();
  if (uid === inviter.uid) throw new Error("Це твоє власне посилання.");
  const batch = writeBatch(firebaseDb);
  batch.set(doc(firebaseDb, "users", uid, "friends", inviter.uid), {
    name: inviter.name.slice(0, 100),
    picture: inviter.picture.slice(0, 2048),
    since: serverTimestamp(),
  });
  batch.set(doc(firebaseDb, "users", inviter.uid, "friends", uid), {
    name: mine.name.slice(0, 100),
    picture: mine.picture.slice(0, 2048),
    since: serverTimestamp(),
    invite: token,
  });
  // A request sent earlier is no longer needed.
  batch.delete(doc(firebaseDb, "users", inviter.uid, "requests", uid));
  await batch.commit();
}

export async function acceptRequest(from: Person) {
  const uid = me();
  const batch = writeBatch(firebaseDb);
  batch.set(doc(firebaseDb, "users", uid, "friends", from.uid), {
    name: from.name.slice(0, 100),
    picture: from.picture.slice(0, 2048),
    since: serverTimestamp(),
  });
  batch.delete(doc(firebaseDb, "users", uid, "requests", from.uid));
  await batch.commit();
}

export async function declineRequest(fromUid: string) {
  await deleteDoc(doc(firebaseDb, "users", me(), "requests", fromUid));
}

/** Stops sharing with this person and rotates invite keys so an old link cannot re-add them. */
export async function removeFriend(friendUid: string) {
  const uid = me();
  const invites = await getDocs(
    collection(firebaseDb, "users", uid, "invites"),
  );
  const batch = writeBatch(firebaseDb);
  batch.delete(doc(firebaseDb, "users", uid, "friends", friendUid));
  for (const d of invites.docs) batch.delete(d.ref);
  batch.set(doc(firebaseDb, "users", uid, "invites", newInviteToken()), {
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

function useCollection(path: "friends" | "requests", uid: string | null) {
  const [list, setList] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    setList(null);
    setError(null);
    return onSnapshot(
      collection(firebaseDb, "users", uid, path),
      (snap) =>
        setList(
          snap.docs
            .map((d) => person(d.id, d.data()))
            .sort((a, b) => a.name.localeCompare(b.name, "ru")),
        ),
      (err) => {
        setError(friendsError(err));
        setList([]);
      },
    );
  }, [uid, path]);
  return { list, error };
}

export const useFriendList = (uid: string | null) =>
  useCollection("friends", uid);
export const useRequests = (uid: string | null) =>
  useCollection("requests", uid);

function shared(data: Record<string, unknown>): SharedRating | null {
  if (
    typeof data.id !== "number" ||
    (data.type !== "movie" && data.type !== "tv")
  )
    return null;
  return {
    id: data.id,
    type: data.type,
    title: String(data.title || ""),
    poster: String(data.poster || ""),
    year: String(data.year || ""),
    status: data.status as SharedRating["status"],
    rating: typeof data.rating === "number" ? data.rating : null,
    season: typeof data.season === "number" ? data.season : undefined,
    episode: typeof data.episode === "number" ? data.episode : undefined,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
  };
}

/** Everything a friend shares; throws permission-denied until they add me back. */
export async function loadFriendRatings(uid: string) {
  const snap = await getDocs(
    collection(firebaseDb, "profiles", uid, "ratings"),
  );
  return snap.docs
    .map((d) => shared(d.data()))
    .filter((x): x is SharedRating => x !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export type FriendRating = { friend: Person; rating: SharedRating };

/** How each friend marked one title; friends who have not shared are skipped. */
export async function loadFriendsOn(
  friends: Person[],
  type: MediaType,
  id: number,
): Promise<FriendRating[]> {
  const rows = await Promise.all(
    friends.map(async (friend) => {
      try {
        const snap = await getDoc(
          doc(firebaseDb, "profiles", friend.uid, "ratings", `${type}-${id}`),
        );
        const rating = snap.exists() ? shared(snap.data()) : null;
        return rating ? { friend, rating } : null;
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((x): x is FriendRating => x !== null);
}

export function toShared(item: LibraryItem): SharedRating {
  const row: SharedRating = {
    id: item.id,
    type: item.type,
    title: item.title,
    poster: item.poster,
    year: item.year,
    status: item.status,
    rating: item.rating,
    updatedAt: item.updatedAt,
  };
  if (item.season !== undefined) row.season = item.season;
  if (item.episode !== undefined) row.episode = item.episode;
  return row;
}

function canon(r: SharedRating | null) {
  if (!r) return "";
  return JSON.stringify([
    r.id,
    r.type,
    r.title,
    r.poster,
    r.year,
    r.status,
    r.rating,
    r.season ?? null,
    r.episode ?? null,
    r.updatedAt,
  ]);
}

const mirroredCache = new Map<string, Map<string, string>>();
const mirrorQueues = new Map<string, Promise<void>>();

/** Mirrors the owner's library (without notes) into profiles/{uid}/ratings, serialized per uid. */
export function mirrorLibrary(
  uid: string,
  items: LibraryItem[],
): Promise<void> {
  const prev = mirrorQueues.get(uid) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      if (firebaseAuth.currentUser?.uid !== uid) return;
      try {
        const ref = collection(firebaseDb, "profiles", uid, "ratings");
        let known = mirroredCache.get(uid);
        if (!known) {
          const snap = await getDocs(ref);
          known = new Map(
            snap.docs.map((d) => [d.id, canon(shared(d.data()))]),
          );
          mirroredCache.set(uid, known);
        }
        const rows = new Map(items.map((x) => [itemKey(x), toShared(x)]));
        const ops: Array<[string, SharedRating | null]> = [];
        for (const [key, row] of rows)
          if (known.get(key) !== canon(row)) ops.push([key, row]);
        for (const key of known.keys())
          if (!rows.has(key)) ops.push([key, null]);
        // Firestore allows 500 writes per batch.
        for (let i = 0; i < ops.length; i += 400) {
          const batch = writeBatch(firebaseDb);
          for (const [key, row] of ops.slice(i, i + 400)) {
            if (row) batch.set(doc(ref, key), row);
            else batch.delete(doc(ref, key));
          }
          await batch.commit();
          for (const [key, row] of ops.slice(i, i + 400)) {
            if (row) known.set(key, canon(row));
            else known.delete(key);
          }
        }
      } catch {
        mirroredCache.delete(uid);
      }
    });
  mirrorQueues.set(uid, next);
  return next;
}

export function useShareWithFriends(uid: string | null, items: LibraryItem[]) {
  const { list: friends } = useFriendList(uid);
  const hasFriends = Boolean(friends?.length);
  useEffect(() => {
    if (!uid || !hasFriends) return;
    const timer = window.setTimeout(() => {
      void mirrorLibrary(uid, items);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [uid, hasFriends, items]);
}

/** Keeps the public name card current so invite links show who sent them. */
export function usePublishProfile(
  uid: string | null,
  name: string,
  picture: string,
) {
  useEffect(() => {
    if (!uid) return;
    publishProfile(name, picture).catch(() => undefined);
  }, [uid, name, picture]);
}
