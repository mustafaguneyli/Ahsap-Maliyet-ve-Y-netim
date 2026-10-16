import { getIdToken, notifyUnauthorized } from './auth';

function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:3000';
  }
  throw new Error('VITE_API_URL production build için zorunludur.');
}

export const apiUrl = resolveApiBaseUrl();

export type ApiErrorBody = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null, fallbackMessage: string) {
    super(resolveApiErrorMessage(status, body, fallbackMessage));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function resolveApiErrorMessage(
  status: number,
  body: ApiErrorBody | null,
  fallbackMessage: string,
): string {
  const raw = body?.message;
  const message = Array.isArray(raw) ? raw.join(' ') : raw;

  if (status === 409) {
    if (
      message &&
      /NET adet|parça ölçüsü|production.?yield|aktif kombinasyon/i.test(message)
    ) {
      return 'Bu ham madde ve parça ölçüsü için aktif bir NET adet zaten mevcut.';
    }
    if (message && /code|ham madde kodu/i.test(message)) {
      return 'Bu ham madde kodu zaten kullanılıyor.';
    }
    if (message && message.trim().length > 0) {
      return message;
    }
    return 'Bu kayıt zaten mevcut.';
  }

  if (message && message.trim().length > 0) {
    return message;
  }

  return fallbackMessage;
}

export async function authHeaders(
  forceRefresh = false,
): Promise<Record<string, string>> {
  const token = await getIdToken(forceRefresh);
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

async function fetchApi(
  path: string,
  options: RequestInit | undefined,
  forceRefresh: boolean,
): Promise<Response> {
  const bearer = await authHeaders(forceRefresh);
  return fetch(`${apiUrl}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...bearer,
      ...(options?.headers ?? {}),
    },
  });
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchApi(path, options, false);
    if (response.status === 401) {
      response = await fetchApi(path, options, true);
      if (response.status === 401) {
        notifyUnauthorized();
      }
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new Error(
      'Sunucuya bağlanılamadı. Formdaki veriler duruyor; bağlantı gelince tekrar deneyin.',
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let body: ApiErrorBody | null = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text) as ApiErrorBody;
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, body, 'İşlem tamamlanamadı.');
  }

  return body as T;
}
