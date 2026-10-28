/**
 * Browser API helpers.
 *
 * Mutating requests in iskole must carry an `Idempotency-Key` header: the API's
 * idempotency middleware refuses a POST without one so a double tap or a browser retry
 * cannot create two records. That contract lives here so pages do not repeat it.
 */

function randomKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type ApiError = { error?: string; issues?: Array<{ path: string; message: string }> };

export class ApiRequestError extends Error {
  status: number;
  details: ApiError;

  constructor(status: number, details: ApiError) {
    super(details.error ?? `Request failed with status ${status}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

/** `POST` JSON with an idempotency key and a parsed error on failure. */
export async function postJson<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (!headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', randomKey());
  }

  const res = await fetch(url, {
    ...init,
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) {
    throw new ApiRequestError(res.status, data);
  }
  return data;
}

/** `PATCH`/`PUT`/`DELETE` JSON with an idempotency key and a parsed error on failure. */
export async function mutateJson<T>(
  url: string,
  method: 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (!headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', randomKey());
  }

  const res = await fetch(url, {
    ...init,
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) {
    throw new ApiRequestError(res.status, data);
  }
  return data;
}

/** Read a JSON response, throwing ApiRequestError on a non-2xx status. */
export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, method: 'GET' });
  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) {
    throw new ApiRequestError(res.status, data);
  }
  return data;
}

/** Human-readable message for an API failure. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.details.issues?.length) {
      return error.details.issues.map((issue) => issue.message).join('. ');
    }
    return error.details.error ?? 'Something went wrong. Please try again.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
