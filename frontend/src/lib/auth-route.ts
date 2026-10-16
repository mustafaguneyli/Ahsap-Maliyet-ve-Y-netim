function appBasePath(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.replace(/\/+$/, '');
}

export function loginPath(): string {
  return `${appBasePath()}/login`;
}

export function homePath(): string {
  const base = appBasePath();
  return base.length > 0 ? `${base}/` : '/';
}

export function isLoginPath(pathname = window.location.pathname): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === loginPath().replace(/\/+$/, '') || normalized === '/login';
}

export function goToLogin(): void {
  const target = loginPath();
  if (window.location.pathname.replace(/\/+$/, '') !== target.replace(/\/+$/, '')) {
    window.history.replaceState(null, '', target);
  }
}

export function goToHome(): void {
  const target = homePath();
  const current = window.location.pathname.replace(/\/+$/, '') || '/';
  const homeNormalized = target.replace(/\/+$/, '') || '/';
  if (current !== homeNormalized) {
    window.history.replaceState(null, '', target);
  }
}
