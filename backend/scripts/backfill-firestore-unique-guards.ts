/**
 * Mevcut Firestore belgelerinden `_unique/{constraint}/keys/{key}` guard üretir.
 * İş koleksiyonlarını değiştirmez. Kimlik bilgisi yazdırmaz.
 */
import * as admin from 'firebase-admin';
import { FIRESTORE_UNIQUE_COLLECTION } from '../src/firebase/firestore.collections';
import { uniqueGuardsFor } from '../src/data-store/firestore-uniques';
import { DATA_STORE_MODEL_MAP } from '../src/data-store/data-store.mapping';

const CHUNK = 400;

function initAdmin(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.app();
  }
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID gerekli.');
  }
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

async function main(): Promise<void> {
  const app = initAdmin();
  const db = app.firestore();
  let guards = 0;

  for (const mapping of DATA_STORE_MODEL_MAP) {
    const snap = await db.collection(mapping.collection).get();
    const writes: Array<{ constraint: string; key: string; ownerId: string }> = [];
    for (const doc of snap.docs) {
      const data = { id: doc.id, ...(doc.data() as Record<string, unknown>) };
      if (data.id !== doc.id) {
        throw new Error(`${mapping.collection}/${doc.id} id sapması.`);
      }
      for (const guard of uniqueGuardsFor(mapping.collection, data)) {
        writes.push({ ...guard, ownerId: doc.id });
      }
    }

    for (let i = 0; i < writes.length; i += CHUNK) {
      const batch = db.batch();
      for (const item of writes.slice(i, i + CHUNK)) {
        const ref = db
          .collection(FIRESTORE_UNIQUE_COLLECTION)
          .doc(item.constraint)
          .collection('keys')
          .doc(item.key);
        batch.set(ref, {
          ownerId: item.ownerId,
          constraint: item.constraint,
          key: item.key,
        });
      }
      await batch.commit();
    }
    guards += writes.length;
    console.log(`${mapping.collection} uniqueGuards=${writes.length}`);
  }

  console.log(JSON.stringify({ uniqueGuards: guards, collection: FIRESTORE_UNIQUE_COLLECTION }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'unique backfill failed');
  process.exitCode = 1;
});
