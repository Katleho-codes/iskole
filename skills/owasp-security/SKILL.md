---
name: owasp-security
description: Use throughout the iskole build, on every route, form, auth flow, and data access path, not just once. Translates the OWASP Cheat Sheet Series (https://cheatsheetseries.owasp.org/) into concrete rules for this stack (Next.js, Express, Prisma, better-auth), since this system holds personal data of young people including minors, under POPIA.
---

# OWASP security baseline for iskole

iskole stores personal data of young South Africans aged 16 to 35, including minors (ID numbers, guardian consent records, wellness bookings) in one database. Treat every cheat sheet below as a requirement, not a suggestion. Reference: https://cheatsheetseries.owasp.org/

## Authentication and session management

(OWASP: Authentication Cheat Sheet, Session Management Cheat Sheet, Credential Stuffing Prevention)

- Use better-auth's built-in session handling rather than hand-rolling tokens. Don't implement a parallel auth path "just for the admin area" or "just for the API."
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`. Never store the session token in `localStorage` or a non-HttpOnly cookie.
- Rotate the session ID on login and on privilege change (e.g. role change), not just on logout.
- Enforce a server-side session/account lockout or rate limit on failed login attempts (see rate limiting below) to resist credential stuffing and brute force.
- Password requirements follow NIST 800-63B via the Authentication Cheat Sheet: minimum length (12+), no forced complexity rules, no forced periodic rotation, check against a breached-password list (e.g. via the k-anonymity Have I Been Pwned API) at signup/reset.
- Generic error messages on login failure ("invalid email or password"), never "no account with that email" — that leaks which emails are registered.

## Authorization

(OWASP: Authorization Cheat Sheet, Access Control Cheat Sheet)

- Authorization check happens server-side, on every request, never inferred from what the UI shows or hides. A hidden button is not access control.
- Combine role check (`requireRole`) with an ownership check on every route: every data access is scoped by the authenticated user's id (ownership), and company access is limited to opted-in adults. A STUDENT hitting `/applications/:id` must be rejected if the application does not belong to them, even though they hold the right role.
- Deny by default: a new route with no explicit guard should fail closed, not open.
- Re-check authorization on object-level access, not just route-level (a STUDENT hitting `/applications/:id` must be checked against whether that application belongs to them, not just whether they hold the STUDENT role; a COMPANY hitting `/company/candidates` must only ever receive learners who opted in and are 18 or older).

## Input validation and injection

(OWASP: Input Validation Cheat Sheet, SQL Injection Prevention, Injection Prevention)

- Validate every external input (API body, query params, form input) against a Zod schema in `packages/shared` before it reaches business logic. Validate shape, type, length, and format, not just presence.
- Prisma's parameterized queries prevent SQL injection by default — never drop to `prisma.$queryRawUnsafe` or string-concatenated raw SQL with user input. If raw SQL is unavoidable, use `prisma.$queryRaw` with tagged-template parameters only.
- Sanitize/escape any user-supplied content rendered as HTML (notices, comments) to prevent stored XSS; prefer rendering as plain text and let React's default escaping do its job rather than `dangerouslySetInnerHTML`.

## Cross-Site Request Forgery

(OWASP: CSRF Prevention Cheat Sheet)

- If using cookie-based sessions (likely, via better-auth), apply CSRF protection on state-changing routes: SameSite cookies plus a CSRF token or double-submit cookie pattern on POST/PUT/PATCH/DELETE.

## Transport and headers

(OWASP: Transport Layer Security Cheat Sheet, HTTP Security Response Headers Cheat Sheet)

- HTTPS only in every environment beyond local dev; redirect HTTP to HTTPS.
- Set security headers via middleware (e.g. `helmet` in Express): `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` or a CSP `frame-ancestors`, and a Content-Security-Policy that doesn't allow `unsafe-inline` for scripts.

## Secrets and configuration

(OWASP: Secrets Management Cheat Sheet)

- No secret (DB credentials, encryption keys, better-auth secret, API keys) ever committed to the repo, including in `.env` files tracked by git. `.env` stays in `.gitignore`; ship `.env.example` with placeholder values.
- Encryption keys for ID number encryption come from environment-managed secrets, never hardcoded, and are different per environment (dev/staging/prod).
- ID numbers: validate the 13-digit format and Luhn checksum, encrypt with AES-256-GCM using a per-environment key from env, store only ciphertext plus IV and tag, never log. Collection is minimised: only at the point of an application that needs it.

## Sensitive data and cryptographic storage

(OWASP: Cryptographic Storage Cheat Sheet, Password Storage Cheat Sheet)

- Passwords: handled by better-auth's hashing (verify it uses bcrypt/argon2 under the hood, not a reversible scheme) — never store or log plaintext passwords.
- ID numbers: AES-256-GCM at rest per the Secrets section above, never plaintext, never logged.
- Minimize what's logged generally: no PII (full names paired with ID numbers, medical info, addresses) in application logs. Log identifiers (record IDs), not personal content.

## Logging and monitoring

(OWASP: Logging Cheat Sheet)

- Log authentication events (login success/failure, password reset, role change) and authorization failures (403s) with enough context to investigate, but without the sensitive payload.
- The `AuditLog` model covers data-change tracking; `SecurityEvent` covers auth events, 403s and rate limit hits. Both are created in this repo (Prisma). Security-event logging is separate from audit logging and exists for detecting attacks and misuse.

## File uploads

(OWASP: File Upload Cheat Sheet)

- Validate file type by content inspection, not just the extension or client-supplied MIME type, for documents (birth certificates, proof of residence, etc.).
- Enforce a max file size server-side.
- Store uploads in object storage (per the instructions doc), never in a web-servable directory inside the app itself. Serve via signed URLs, not direct public paths.
- Scan or at minimum constrain accepted file types (PDF, JPG, PNG) — reject executables and scripts outright.

## REST API hardening

(OWASP: REST Security Cheat Sheet, API Security)

- Rate limit per IP and per account on auth routes and any expensive query route.
- Return generic error messages to clients; keep stack traces and internal error detail server-side only (OWASP: Error Handling Cheat Sheet).
- Version the API or otherwise avoid breaking changes landing silently on existing clients.

## Dependency hygiene

(OWASP: Vulnerable Dependency Management)

- Run `npm audit` / `pnpm audit` as part of CI, not just locally and occasionally.
- Pin dependency versions; review before bumping majors, especially for auth and crypto-adjacent packages.

## When this applies

Apply this skill continuously, not as a one-time pass: every new Express route, every new form, every place user input reaches the database or gets rendered back, every place a secret or credential is introduced. When in doubt about whether a specific decision satisfies a relevant cheat sheet, check the actual page at https://cheatsheetseries.owasp.org/ rather than guessing from general security instinct — the cheat sheets are specific about what counts as sufficient.

## Quick self-check before marking a route or feature done

- [ ] Authorization checked server-side, by both role and ownership, on this route (company access: opted-in adults only)
- [ ] All external input validated via a Zod schema before use
- [ ] No raw/string-built SQL with user input
- [ ] No secret or key hardcoded or committed
- [ ] No PII or secrets in logs
- [ ] Security headers and HTTPS enforced (checked once at the app level, not per-route)
- [ ] File uploads (if any) validated by content, size-limited, stored outside the web root
