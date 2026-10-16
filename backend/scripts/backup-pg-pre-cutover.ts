/**
 * Cutover öncesi timestamp’li PG snapshot kopyası.
 * Mevcut firestore-pg-snapshot.json üzerine yazılmaz. PostgreSQL silinmez.
 */
import * as fs from 'fs';
import * as path from 'path';

function stamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function main(): Promise<void> {
  const secretsDir = path.join(__dirname, '../secrets');
  const source = path.join(secretsDir, 'firestore-pg-snapshot.json');
  if (!fs.existsSync(source)) {
    throw new Error(`Kaynak yedek yok: ${source}`);
  }
  const destName = `firestore-pg-pre-cutover-${stamp()}.json`;
  const dest = path.join(secretsDir, destName);
  if (fs.existsSync(dest)) {
    throw new Error(`Hedef yedek zaten var, üzerine yazılmaz: ${destName}`);
  }
  fs.copyFileSync(source, dest);
  const bytes = fs.statSync(dest).size;
  if (bytes <= 0) {
    throw new Error('Yedek boş kopyalandı.');
  }
  console.log(`Pre-cutover yedek: secrets/${destName} (${bytes} byte)`);
  console.log('firestore-pg-snapshot.json değiştirilmedi. PostgreSQL silinmedi.');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
