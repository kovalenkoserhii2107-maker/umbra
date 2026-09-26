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
