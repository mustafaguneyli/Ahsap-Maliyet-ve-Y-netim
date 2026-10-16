import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

/** İstemci Auth + Analytics kullanır. Firestore/master data tarayıcıdan okunmaz veya yazılmaz. */

function readConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    return null;
  }
  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
}

const firebaseConfig = readConfig();

export const firebaseApp: FirebaseApp | null = firebaseConfig
  ? initializeApp(firebaseConfig)
  : null;

if (firebaseApp) {
  void isSupported()
    .then((supported) => {
      if (supported && firebaseApp) {
        getAnalytics(firebaseApp);
      }
    })
    .catch(() => {
      /* Analytics yoksa uygulama çalışmaya devam eder. */
    });
}
