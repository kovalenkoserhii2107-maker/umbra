import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyB36jI_dHF9kGeE1w1PKBIhg3dGu6uAH04',
  authDomain: 'umbra-18ba8.firebaseapp.com',
  projectId: 'umbra-18ba8',
  storageBucket: 'umbra-18ba8.firebasestorage.app',
  messagingSenderId: '930734450482',
  appId: '1:930734450482:web:b95eaf82aba0461446992b',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const firebaseAuth = getAuth(firebaseApp)
export const firebaseDb = getFirestore(firebaseApp)
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
