/**
 * Mevcut Firestore koleksiyon adlarını ve sayılarını raporlar.
 * Yeni koleksiyon oluşturmaz. Kimlik bilgisi yazdırmaz.
 */
import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { DATA_STORE_MODEL_MAP } from '../src/data-store/data-store.mapping';
import { FIRESTORE_COLLECTIONS } from '../src/firebase/firestore.collections';

async function main(): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const apiKey = process.env.FIREBASE_API_KEY?.trim();
  if (!projectId || !apiKey) {
    throw new Error('FIREBASE_PROJECT_ID ve FIREBASE_API_KEY gerekli.');
  }

  const app = initializeApp({
    apiKey,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  });
  const db = getFirestore(app);

  const expected = Object.values(FIRESTORE_COLLECTIONS);
  const rows: Array<{ prismaModel: string; collection: string; count: number }> = [];

  for (const mapping of DATA_STORE_MODEL_MAP) {
    const snap = await getDocs(collection(db, mapping.collection));
    rows.push({
      prismaModel: mapping.prismaModel,
      collection: mapping.collection,
      count: snap.size,
    });
    console.log(`${mapping.prismaModel} -> ${mapping.collection} count=${snap.size}`);
  }

  const missing = expected.filter((name) => !rows.some((row) => row.collection === name));
  if (missing.length) {
    throw new Error(`Eşleşmeyen koleksiyon: ${missing.join(', ')}`);
  }
  console.log(JSON.stringify({ projectId, collections: rows.length, rows }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'inspect failed');
  process.exitCode = 1;
});
