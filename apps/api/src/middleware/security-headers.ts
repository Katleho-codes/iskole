/**
 * Security headers for every API response (OWASP: HTTP Security Response Headers Cheat Sheet).
 * CSP: no unsafe-inline for scripts. style-src keeps unsafe-inline because HTML forms and
 * Next-delivered styles may set inline style attributes; scripts never do.
 */
import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  // The Next rewrite proxy must be able to embed API responses.
  crossOriginEmbedderPolicy: false,
  // Belt and braces with CSP frame-ancestors: no one frames iskole responses.
  frameguard: { action: 'deny' },
  // Effective on HTTPS deployments; browsers ignore it on plain http in local dev.
  hsts: { maxAge: 15552000, includeSubDomains: true },
  referrerPolicy: { policy: 'no-referrer' },
});
