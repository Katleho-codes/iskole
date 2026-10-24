/**
 * Content Security Policy with a per-request nonce (Next.js docs:
 * https://nextjs.org/docs/app/guides/content-security-policy).
 * Next delivers the RSC payload with inline scripts, so script-src uses a nonce plus
 * strict-dynamic. There is no unsafe-inline for scripts anywhere in iskole.
 * style-src keeps unsafe-inline: browsers require it for style attributes, and the
 * cheat sheet restricts scripts, not styles, for XSS defence.
 *
 * Development only: React's dev build calls eval() to reconstruct server-side callstacks
 * in the browser, so a strict script-src without unsafe-eval logs a warning and degrades
 * dev error messages. Next's CSP guide prescribes unsafe-eval under NODE_ENV=development
 * for exactly this reason, and states React never calls eval() in production.
 * The isDev branch is the whole safety argument: unsafe-eval is unreachable in a
 * production build. Any change here must keep that property, and the OWASP self-check
 * verifies the production policy contains no unsafe-eval.
 *
 * File convention: Next 16 renamed middleware.ts to proxy.ts and the exported function
 * to `proxy` (docs: /docs/app/api-reference/file-conventions/proxy). This file runs on
 * the web app only; it is an optimistic layer, never the security boundary. Express
 * enforces authorization.
 */
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  // Dev-only relaxation, never present in a production build. See the header comment.
  const isDev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
