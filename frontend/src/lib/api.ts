const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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

  if (status === 409 || (message && /zaten var|already|unique|duplicate|P2002/i.test(message))) {
    return 'Bu ham madde kodu zaten kullanılıyor.';
  }

  if (message && message.trim().length > 0) {
    return message;
  }

  return fallbackMessage;
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

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
    throw new ApiError(response.status, body, `İstek başarısız (HTTP ${response.status}).`);
  }

  return body as T;
}

export { apiUrl };
