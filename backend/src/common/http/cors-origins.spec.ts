import { resolveAllowedOrigins } from './cors-origins';

describe('resolveAllowedOrigins', () => {
  it('geliştirmede varsayılan localhost ve 127.0.0.1 ekler', () => {
    expect(resolveAllowedOrigins({ NODE_ENV: 'development' })).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('Firebase Hosting ve custom domain allowlist kabul eder', () => {
    const origins = resolveAllowedOrigins({
      NODE_ENV: 'production',
      FRONTEND_ORIGINS:
        'https://zirve-ahsap.web.app,https://zirve-ahsap.firebaseapp.com,https://maliyet.zirveahsap.com',
    });
    expect(origins).toEqual([
      'https://zirve-ahsap.web.app',
      'https://zirve-ahsap.firebaseapp.com',
      'https://maliyet.zirveahsap.com',
    ]);
  });

  it('production `*` reddeder', () => {
    expect(() =>
      resolveAllowedOrigins({ NODE_ENV: 'production', FRONTEND_ORIGIN: '*' }),
    ).toThrow(/allowlist/);
  });

  it('production boş origin reddeder', () => {
    expect(() => resolveAllowedOrigins({ NODE_ENV: 'production' })).toThrow(
      /FRONTEND_ORIGIN/,
    );
  });
});
