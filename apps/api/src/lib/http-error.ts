/**
 * Minimal HTTP error carrying a client-safe message. The error handler turns this into a
 * JSON response without leaking stack traces or internal detail (OWASP Error Handling).
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (message = 'not found') => new HttpError(404, message);
export const forbidden = (message = 'forbidden') => new HttpError(403, message);
export const unauthorized = (message = 'unauthenticated') => new HttpError(401, message);
export const badRequest = (message = 'invalid request') => new HttpError(400, message);
export const unprocessable = (message = 'unprocessable') => new HttpError(422, message);
