import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence,
  initializeAuth,
  browserPopupRedirectResolver,
  connectAuthEmulator,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBJFd1XWNZcw-GH6DWO6N_jfHvSy7Ckr2U",
  authDomain: "umbra-18ba8.firebaseapp.com",
  projectId: "umbra-18ba8",
  storageBucket: "umbra-18ba8.firebasestorage.app",
  messagingSenderId: "930734450482",
  appId: "1:930734450482:web:b955af82aba0461446992b",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = initializeAuth(firebaseApp, {
  persistence: [
    indexedDBLocalPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
  ],
  popupRedirectResolver: browserPopupRedirectResolver,
});
export const firebaseDb = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
// Only a development build can connect to local emulators.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(firebaseDb, "127.0.0.1", 8080);
}
