/**
 * DATA_STORE=firestore yalnız shadow + Admin hazırsa.
 * DATABASE_URL / PostgreSQL bağlantısı silinmez. Rollback: DATA_STORE=postgres.
 */
import * as fs from 'fs';
import * as path from 'path';

const ENV_PATH = path.join(__dirname, '../.env');
const REPORT_PATH = path.join(__dirname, '../secrets/shadow-compare-report.json');

function hasAdminCredential(): boolean {
  if (process.env.FIREBASE_USE_ADC === 'true') {
    return true;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return true;
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    return true;
  }
  const email = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const key = process.env.FIREBASE_PRIVATE_KEY?.trim();
  return Boolean(email && key);
}

function setDataStore(next: 'firestore' | 'postgres'): void {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error('backend/.env yok.');
  }
  const original = fs.readFileSync(ENV_PATH, 'utf8');
  const lines = original.split(/\r?\n/);
  let found = false;
  const updated = lines.map((line) => {
    if (/^DATA_STORE\s*=/.test(line)) {
      found = true;
      return `DATA_STORE=${next}`;
    }
    return line;
  });
  if (!found) {
    updated.push(`DATA_STORE=${next}`);
  }
  fs.writeFileSync(ENV_PATH, updated.join('\n'), 'utf8');
}

function main(): void {
  if (!fs.existsSync(REPORT_PATH)) {
    console.error('CUTOVER YAPMA: shadow-compare raporu yok.');
    process.exitCode = 2;
    return;
  }
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')) as {
    passed?: boolean;
    cutover?: string;
  };
  if (report.passed !== true || report.cutover !== 'parity-ok') {
    console.error('CUTOVER YAPMA: shadow parity geçmedi.');
    process.exitCode = 1;
    return;
  }
  if (!hasAdminCredential()) {
    console.error(
      'CUTOVER YAPMA: Firestore Admin kimliği yok. DATA_STORE=postgres bırakıldı. Rollback için env değiştirmeye gerek yok.',
    );
    process.exitCode = 2;
    return;
  }
  setDataStore('firestore');
  console.log('DATA_STORE=firestore yazıldı. DATABASE_URL duruyor. Rollback: DATA_STORE=postgres');
}

main();
