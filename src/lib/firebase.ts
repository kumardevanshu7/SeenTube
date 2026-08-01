import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseEnv = {
  PUBLIC_FIREBASE_API_KEY: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  PUBLIC_FIREBASE_AUTH_DOMAIN: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  PUBLIC_FIREBASE_PROJECT_ID: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  PUBLIC_FIREBASE_STORAGE_BUCKET: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  PUBLIC_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  PUBLIC_FIREBASE_APP_ID: import.meta.env.PUBLIC_FIREBASE_APP_ID,
} as const;

const missingVariables = Object.entries(firebaseEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingVariables.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVariables.join(", ")}`);
}

type FirebaseGlobals = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  persistenceReady: Promise<void>;
};

declare global {
  // Keep a single Auth/Firestore instance across Astro page loads / HMR.
  // eslint-disable-next-line no-var
  var __seentubeFirebase: FirebaseGlobals | undefined;
}

function getFirebase(): FirebaseGlobals {
  if (globalThis.__seentubeFirebase) return globalThis.__seentubeFirebase;

  const app = getApps().length > 0
    ? getApp()
    : initializeApp({
      apiKey: firebaseEnv.PUBLIC_FIREBASE_API_KEY,
      authDomain: firebaseEnv.PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: firebaseEnv.PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: firebaseEnv.PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: firebaseEnv.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: firebaseEnv.PUBLIC_FIREBASE_APP_ID,
    });

  const auth = getAuth(app);
  const db = getFirestore(app);

  // Only configure persistence once per browser tab lifetime.
  const persistenceReady = typeof window === "undefined"
    ? Promise.resolve()
    : (globalThis as { __seentubeAuthPersistence?: Promise<void> }).__seentubeAuthPersistence
      ?? ((globalThis as { __seentubeAuthPersistence?: Promise<void> }).__seentubeAuthPersistence =
        setPersistence(auth, browserLocalPersistence)
          .then(() => undefined)
          .catch((error) => {
            console.error("Firebase auth persistence failed:", error);
          }));

  const firebase = { app, auth, db, persistenceReady };
  if (typeof window !== "undefined") {
    globalThis.__seentubeFirebase = firebase;
  }
  return firebase;
}

const firebase = getFirebase();

export const auth = firebase.auth;
export const db = firebase.db;
export const googleProvider = new GoogleAuthProvider();
export const authPersistenceReady = firebase.persistenceReady;
