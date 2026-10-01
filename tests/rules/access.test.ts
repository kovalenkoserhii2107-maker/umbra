import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
let env: RulesTestEnvironment;
const value = {
  id: 1,
  type: "movie",
  title: "Film",
  poster: "",
  year: "2026",
  status: "watchlist",
  rating: null,
  note: "private",
  updatedAt: serverTimestamp(),
};
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-umbra",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(async () => {
  await env.cleanup();
});
it("allows the owner to create, read, edit and delete a title without optional fields", async () => {
  const db = env.authenticatedContext("A").firestore();
  const ref = doc(db, "users/A/library/movie-1");
  await assertSucceeds(setDoc(ref, value));
  await assertSucceeds(updateDoc(ref, { rating: 8, note: "edited" }));
  expect((await assertSucceeds(getDoc(ref))).data()?.rating).toBe(8);
  await assertSucceeds(getDocs(collection(db, "users/A/library")));
  await assertSucceeds(deleteDoc(ref));
});
it("rejects every cross-account and anonymous operation", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/A/library/movie-1"), value);
  });
  for (const db of [
    env.authenticatedContext("B").firestore(),
    env.unauthenticatedContext().firestore(),
  ]) {
    const ref = doc(db, "users/A/library/movie-1");
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(db, "users/A/library")));
    await assertFails(setDoc(ref, value));
    await assertFails(updateDoc(ref, { note: "stolen" }));
    await assertFails(deleteDoc(ref));
  }
});
it("rejects invalid data and mismatched document IDs", async () => {
  const db = env.authenticatedContext("A").firestore();
  for (const patch of [
    { rating: 11 },
    { note: "x".repeat(5001) },
    { type: "person" },
    { owner: "B" },
    { id: 2 },
  ])
    await assertFails(
      setDoc(doc(db, "users/A/library/movie-1"), { ...value, ...patch }),
    );
});
it("does not recreate a deleted record when a stale device edits a field", async () => {
  const db = env.authenticatedContext("A").firestore();
  const ref = doc(db, "users/A/library/movie-1");
  await setDoc(ref, value);
  await deleteDoc(ref);
  await assertFails(updateDoc(ref, { note: "stale" }));
  expect((await getDoc(ref)).exists()).toBe(false);
});
const shared = {
  id: 1,
  type: "movie",
  title: "Film",
  poster: "",
  year: "2026",
  status: "watched",
  rating: 8,
  updatedAt: 1,
};
const person = (name: string) => ({
  name,
  picture: "",
  since: serverTimestamp(),
});
it("shows a friend's ratings only after the owner adds them, and never notes", async () => {
  const a = env.authenticatedContext("A").firestore();
  const b = env.authenticatedContext("B").firestore();
  await assertSucceeds(
    setDoc(doc(a, "profiles/A"), {
      name: "Anna",
      picture: "",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(getDoc(doc(b, "profiles/A")));
  await assertFails(getDocs(collection(b, "profiles")));
  await assertSucceeds(setDoc(doc(a, "profiles/A/ratings/movie-1"), shared));
  await assertFails(
    setDoc(doc(a, "profiles/A/ratings/movie-1"), { ...shared, note: "secret" }),
  );
  await assertFails(setDoc(doc(b, "profiles/A/ratings/movie-1"), shared));
  await assertFails(getDoc(doc(b, "profiles/A/ratings/movie-1")));
  await assertFails(setDoc(doc(b, "users/A/friends/B"), person("Boris")));
  await assertSucceeds(setDoc(doc(a, "users/A/friends/B"), person("Boris")));
  await assertSucceeds(getDoc(doc(b, "profiles/A/ratings/movie-1")));
  await assertSucceeds(getDocs(collection(b, "profiles/A/ratings")));
  await assertFails(getDocs(collection(b, "users/A/friends")));
  await assertSucceeds(deleteDoc(doc(a, "users/A/friends/B")));
  await assertFails(getDoc(doc(b, "profiles/A/ratings/movie-1")));
  await assertFails(
    getDoc(
      doc(
        env.unauthenticatedContext().firestore(),
        "profiles/A/ratings/movie-1",
      ),
    ),
  );
});
it("lets people send friend requests only in their own name", async () => {
  const a = env.authenticatedContext("A").firestore();
  const b = env.authenticatedContext("B").firestore();
  const c = env.authenticatedContext("C").firestore();
  const request = { name: "Boris", picture: "", createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(b, "users/A/requests/B"), request));
  await assertFails(setDoc(doc(c, "users/A/requests/B"), request));
  await assertFails(setDoc(doc(b, "users/B/requests/B"), request));
  await assertFails(
    setDoc(doc(b, "users/A/requests/B"), { ...request, role: "admin" }),
  );
  await assertFails(getDoc(doc(b, "users/A/requests/B")));
  await assertSucceeds(getDocs(collection(a, "users/A/requests")));
  await assertFails(getDocs(collection(c, "users/A/requests")));
  await assertSucceeds(deleteDoc(doc(a, "users/A/requests/B")));
  await assertFails(setDoc(doc(a, "users/A/friends/A"), person("Me")));
});

const game = {
  id: 1942,
  title: "The Witcher 3",
  cover: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg",
  year: "2015",
  genre: "Ролевая",
  platforms: ["pc", "playstation"],
  status: "played",
  rating: 10,
  note: "private",
  hours: 120,
  updatedAt: serverTimestamp(),
};

it("keeps games and the Steam link private to the owner and validated", async () => {
  const db = env.authenticatedContext("A").firestore();
  const ref = doc(db, "users/A/games/1942");
  await assertSucceeds(setDoc(ref, game));
  await assertSucceeds(
    updateDoc(ref, {
      status: "owned",
      steam: {
        appId: 292030,
        minutes: 7200,
        recent: 0,
        lastPlayed: 1759000000,
      },
    }),
  );
  await assertFails(setDoc(doc(db, "users/A/games/1"), game));
  await assertFails(setDoc(ref, { ...game, platforms: ["pc", "dreamcast"] }));
  await assertFails(setDoc(ref, { ...game, status: "watched" }));
  await assertFails(
    setDoc(ref, { ...game, cover: "https://evil.example/x.jpg" }),
  );
  await assertFails(setDoc(ref, { ...game, hours: -1 }));
  await assertFails(
    updateDoc(ref, {
      steam: { appId: 1, minutes: 1.5, recent: 0, lastPlayed: 0 },
    }),
  );
  const other = env.authenticatedContext("B").firestore();
  await assertFails(getDoc(doc(other, "users/A/games/1942")));
  await assertFails(setDoc(doc(other, "users/A/games/1942"), game));

  const link = doc(db, "users/A/links/steam");
  const steam = {
    steamId: "76561198000000001",
    name: "Gamer",
    avatar: "",
    linkedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(link, steam));
  await assertSucceeds(updateDoc(link, { syncedAt: serverTimestamp() }));
  await assertFails(setDoc(link, { ...steam, steamId: "123" }));
  await assertFails(setDoc(doc(db, "users/A/links/xbox"), steam));
  await assertFails(getDoc(doc(other, "users/A/links/steam")));
});
