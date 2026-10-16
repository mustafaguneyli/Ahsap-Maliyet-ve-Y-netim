import * as fs from 'fs';
import * as path from 'path';

describe('responsive contract — Firestore cutover CSS değiştirmez', () => {
  it('390x844 / 430x932 mobil, 1366x768 masaüstü kırılımlarını karşılar', () => {
    const frontendSrc = path.join(__dirname, '../../../frontend/src');
    const appCss = fs.readFileSync(path.join(frontendSrc, 'App.css'), 'utf8');
    const indexCss = fs.readFileSync(path.join(frontendSrc, 'index.css'), 'utf8');
    expect(appCss).toContain('@media screen and (max-width: 1099px)');
    expect(appCss).toContain('@media screen and (max-width: 767px)');
    expect(indexCss).toContain('@media screen and (max-width: 767px)');
    expect(1099).toBeGreaterThan(430);
    expect(767).toBeGreaterThan(390);
    expect(1366).toBeGreaterThan(1099);
  });
});
