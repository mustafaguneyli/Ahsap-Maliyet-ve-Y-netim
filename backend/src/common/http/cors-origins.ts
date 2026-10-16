/**
 * Production CORS allowlist. `*` yok.
 * FRONTEND_ORIGINS virgüllü liste; FRONTEND_ORIGIN tek origin (geriye dönük).
 */
export function resolveAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const listed = `${env.FRONTEND_ORIGINS ?? ''},${env.FRONTEND_ORIGIN ?? ''}`
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (listed.some((origin) => origin === '*')) {
    throw new Error('Production CORS `*` kabul etmez. FRONTEND_ORIGINS allowlist kullanın.');
  }

  if (listed.length === 0) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'Production CORS için FRONTEND_ORIGIN veya FRONTEND_ORIGINS zorunludur.',
      );
    }
    listed.push('http://localhost:5173');
  }

  const origins = new Set<string>();
  for (const origin of listed) {
    origins.add(origin);
    if (origin.includes('://localhost')) {
      origins.add(origin.replace('://localhost', '://127.0.0.1'));
    }
    if (origin.includes('://127.0.0.1')) {
      origins.add(origin.replace('://127.0.0.1', '://localhost'));
    }
  }
  return [...origins];
}
