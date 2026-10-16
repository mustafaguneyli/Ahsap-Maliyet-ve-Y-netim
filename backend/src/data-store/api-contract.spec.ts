import * as fs from 'fs';
import * as path from 'path';

/**
 * Frontend endpoint path/DTO sözleşmesi.
 * Firestore cutover bu path'leri değiştirmez; frontend yeniden yazılmaz.
 */
const CONTRACT_PREFIXES = [
  '/cost-calculation',
  '/order-documents',
  '/door-build',
  '/price-list',
  '/health',
  '/raw-materials',
  '/product-groups',
  '/production-yields',
  '/pricing-settings',
  '/extra-costs',
  '/price-overrides',
  '/audit-events',
  '/cita-published-price-bands',
  '/pricing-row-exceptions',
  '/pricing-thickness-modifiers',
] as const;

const CONTRACT_PATHS: Array<{ method: string; path: string }> = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/price-list' },
  { method: 'GET', path: '/cost-calculation/door-frame/mdf' },
  { method: 'GET', path: '/cost-calculation/pervaz/ayarli' },
  { method: 'GET', path: '/cost-calculation/pervaz/dekoratif' },
  { method: 'GET', path: '/cost-calculation/pervaz/dekoratif-genis-kilcik' },
  { method: 'GET', path: '/cost-calculation/supurgelik' },
  { method: 'GET', path: '/cost-calculation/cita/list' },
  { method: 'GET', path: '/cost-calculation/cita' },
  { method: 'GET', path: '/cost-calculation/generic' },
  { method: 'POST', path: '/cost-calculation/order-quote' },
  { method: 'POST', path: '/cost-calculation/catalog-items' },
  { method: 'POST', path: '/cost-calculation/catalog-items/deactivate' },
  { method: 'POST', path: '/cost-calculation/generic-preview' },
  { method: 'GET', path: '/order-documents/catalog' },
  { method: 'GET', path: '/order-documents' },
  { method: 'POST', path: '/order-documents' },
  { method: 'POST', path: '/order-documents/preview' },
  { method: 'POST', path: '/door-build/quote' },
  { method: 'POST', path: '/door-build/order-draft' },
  { method: 'POST', path: '/door-build/workshop-preview' },
  { method: 'GET', path: '/pricing-settings/door-build' },
  { method: 'POST', path: '/pricing-settings/profit-rate' },
];

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function frontendApiRoots(): string[] {
  const apiDir = path.join(__dirname, '../../../frontend/src/api');
  const libFile = path.join(__dirname, '../../../frontend/src/lib/api.ts');
  const files = collectTsFiles(apiDir);
  if (fs.existsSync(libFile)) {
    files.push(libFile);
  }
  const roots = new Set<string>();
  const re =
    /[`'"](\/(?:cost-calculation|order-documents|door-build|price-list|health|raw-materials|product-groups|production-yields|pricing-settings|extra-costs|price-overrides|audit-events|cita-published-price-bands|pricing-row-exceptions|pricing-thickness-modifiers)[^`'"]*)[`'"]/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const raw = match[1].split(/[?$]/)[0].replace(/[`'"].*$/, '');
      const first = raw.split('/').filter(Boolean)[0];
      if (first) {
        roots.add(`/${first}`);
      }
    }
  }
  return [...roots].sort();
}

function controllerSources(): string {
  const src = path.join(__dirname, '..');
  return collectTsFiles(src)
    .filter((file) => file.endsWith('.controller.ts'))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

describe('API contract — frontend Firestore için yeniden yazılmaz', () => {
  const controllers = controllerSources();

  it('frontend yalnız mevcut API köklerini kullanır', () => {
    const roots = frontendApiRoots();
    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      expect(CONTRACT_PREFIXES).toContain(root);
    }
  });

  it('cutover örnek path’leri controller’da durur', () => {
    expect(controllers).toMatch(/@Controller\('cost-calculation'\)/);
    expect(controllers).toMatch(/@Controller\('order-documents'\)/);
    expect(controllers).toMatch(/@Controller\('door-build'\)/);
    expect(controllers).toMatch(/@Controller\('price-list'\)/);
    expect(controllers).toMatch(/@Controller\('health'\)/);
    for (const item of CONTRACT_PATHS) {
      const leaf = item.path.split('/').filter(Boolean).slice(1).join('/');
      if (leaf.length === 0) {
        continue;
      }
      expect(controllers).toContain(leaf.split('/')[0]);
    }
    expect(controllers).toMatch(/@Get\('door-frame\/mdf'\)/);
    expect(controllers).toMatch(/@Get\('pervaz\/ayarli'\)/);
    expect(controllers).toMatch(/@Post\('order-quote'\)/);
    expect(controllers).toMatch(/@Post\('quote'\)/);
    expect(controllers).toMatch(/@Get\('catalog'\)/);
  });

  it('Firestore client SDK path’i frontend API katmanında yoktur', () => {
    const apiDir = path.join(__dirname, '../../../frontend/src/api');
    const text = collectTsFiles(apiDir)
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');
    expect(text).not.toMatch(/collection\(/);
    expect(text).not.toMatch(/getFirestore/);
    expect(text).not.toMatch(/doc\(.*firestore/i);
  });
});
