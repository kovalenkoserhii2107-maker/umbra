import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyBJFd1XWNZcw-GH6DWO6N_jfHvSy7Ckr2U',
  authDomain: 'umbra-18ba8.firebaseapp.com',
  projectId: 'umbra-18ba8',
  storageBucket: 'umbra-18ba8.firebasestorage.app',
  messagingSenderId: '930734450482',
  appId: '1:930734450482:web:b955af82aba0461446992b',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const firebaseAuth = getAuth(firebaseApp)
export const firebaseDb = getFirestore(firebaseApp)
export const googleProvider = new GoogleAuthProvider()
setPersistence(firebaseAuth, browserLocalPersistence).catch(() => undefined)
