import * as fs from 'fs';
import * as path from 'path';
import { FIRESTORE_RUNTIME_INDEXES, toFirestoreIndexesJson } from './firestore-query';

describe('FIRESTORE_RUNTIME_INDEXES', () => {
  it('firestore.indexes.json runtime query listesinden üretilir', () => {
    const generated = toFirestoreIndexesJson();
    const disk = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', '..', 'firestore.indexes.json'), 'utf8'),
    ) as typeof generated;
    expect(disk).toEqual(generated);
  });

  it('gereksiz index üretmez; her index usedBy taşır', () => {
    expect(FIRESTORE_RUNTIME_INDEXES.length).toBeGreaterThan(0);
    for (const index of FIRESTORE_RUNTIME_INDEXES) {
      expect(index.usedBy.trim()).not.toBe('');
      expect(index.fields.length).toBeGreaterThan(1);
    }
  });
});
