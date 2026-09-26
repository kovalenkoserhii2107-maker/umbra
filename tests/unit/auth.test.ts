import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  callback: undefined as undefined | ((user: unknown) => void),
  signOut: vi.fn(),
  local: new Map<string, string>(),
}));
vi.mock("../../src/lib/firebase", () => ({
  firebaseAuth: { currentUser: null },
  googleProvider: {},
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, fn) => {
    mock.callback = fn;
    return vi.fn();
  }),
  getRedirectResult: vi.fn(async () => null),
  signOut: mock.signOut,
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  updateProfile: vi.fn(),
}));
beforeEach(() => {
  vi.resetModules();
  mock.signOut.mockReset();
  vi.stubGlobal("localStorage", {
    removeItem: (key: string) => mock.local.delete(key),
  });
});
it("ignores a stale profile and clears the user when Firebase emits null", async () => {
  mock.local.set("umbra.account", JSON.stringify({ sub: "old" }));
  const auth = await import("../../src/lib/auth");
  auth.listenAuth();
  expect(auth.loadAccount()).toBeNull();
  expect(mock.local.has("umbra.account")).toBe(false);
  mock.callback?.({
    uid: "A",
    email: "a@example.com",
    displayName: "A",
    emailVerified: true,
  });
  expect(auth.loadAccount()?.sub).toBe("A");
  mock.callback?.(null);
  expect(auth.loadAccount()).toBeNull();
});
it("propagates sign-out failure instead of claiming successful logout", async () => {
  const auth = await import("../../src/lib/auth");
  mock.signOut.mockRejectedValue(new Error("failed"));
  await expect(auth.signOutAccount()).rejects.toThrow("failed");
});
it("only accepts local return paths", async () => {
  const { safeReturnPath } = await import("../../src/lib/auth");
  expect(safeReturnPath("/title/movie/1")).toBe("/title/movie/1");
  for (const value of [
    "//evil.example",
    "https://evil.example",
    "/login",
    "/\\evil.example",
  ])
    expect(safeReturnPath(value)).toBe("/cabinet");
});
