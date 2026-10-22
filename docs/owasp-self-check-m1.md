# OWASP self-check: M1 authentication

Milestone M1 covers the authentication spine: better-auth mounted at `/api/auth/*`, the
session and role guards, the four auth screens, and the schema better-auth generated.

This is the "Quick self-check" list from `skills/owasp-security/SKILL.md`, walked item by
item against the code that exists, with the evidence for each verdict. Per the build
instructions, every route and feature gets this treatment, not just the app once.

Rules for this document: a verdict of pass requires evidence I read or ran, not a setting I
remember writing. Anything unverified says so. Anything missing is a fail, even when the fix
is scheduled.

Date: 2026-10-21. Scope: M1 only. Features from M2 onward are not covered here and must not be
assumed to inherit these verdicts.

## Summary

| # | Check | Verdict |
|---|---|---|
| 1 | Authorization checked server-side by role, and by ownership where a record is involved | Pass for role, not yet applicable for ownership |
| 2 | All external input validated via a Zod schema before use | Pass for env and auth boundaries, M2 onward pending |
| 3 | No raw or string-built SQL with user input | Pass |
| 4 | No secret or key hardcoded or committed | Pass |
| 5 | No PII or secrets in logs | Pass |
| 6 | Security headers present, HTTPS enforced outside local dev | Pass for headers, HTTPS deferred |
| 7 | File uploads validated by content, size-limited, outside web root | Not yet applicable, M3 |

Additional items from the full skill that M1 touches:

| # | Check | Verdict |
|---|---|---|
| 8 | better-auth handles sessions, no parallel auth path | Pass |
| 9 | Session cookies HttpOnly, Secure, SameSite | Pass |
| 10 | Passwords hashed with a real KDF, never reversible | Pass |
| 11 | Password policy per NIST 800-63B, breached-password check | Pass |
| 12 | Generic errors on login failure, no email enumeration | Pass |
| 13 | Server-side rate limit against credential stuffing | Pass, with a per-IP caveat |
| 14 | CSRF protection on state-changing routes | Pass |
| 15 | Deny by default on new routes | Pass |
| 16 | Auth and authorization failures logged without the payload | Pass |
| 17 | Generic error messages, no stack traces to clients | Pass |
| 18 | Dependencies audited, versions pinned | Fail, one advisory open (see below) |

## Item by item

### 1. Authorization by role and ownership

**Role: pass.** `apps/api/src/middleware/auth.ts` provides `requireSession` then
`requireRole`. The role is read from the session row only (`req.authUser.role`), never from
the body, headers or query. Role is set by better-auth's admin plugin, and a sign-up that
supplies its own `role` is rejected with 400 `FIELD_NOT_ALLOWED` rather than silently
corrected. Covered by `tests/auth.test.ts`: unauthenticated is 401, wrong role is 403, and
the session cookie is rejected when forged.

**Ownership: not yet applicable.** M1 has no owned records. The first owned resource arrives
in M2, and the pattern is fixed now so it is not improvised later: the data layer takes the
authenticated user id as its first argument, so a query for someone else's record returns
nothing rather than returning their row and filtering in the handler.

### 2. Input validation via Zod

**Pass for what exists.** Environment variables are validated in `apps/api/src/lib/env.ts`.
`packages/shared` holds the schemas that exist so far, `idParamSchema` and `languageSchema`,
with tests alongside them. The error handler already distinguishes a `ZodError` (400 with
safe field detail) from every other failure. No route in M1 accepts a domain body from the
client, because every `/api/auth/*` route belongs to better-auth and validates itself. The
route-level 400 tests in the build instructions become real from M2.

### 3. No raw or string-built SQL

**Pass, verified.** `grep` for `queryRawUnsafe|executeRawUnsafe|queryRaw|executeRaw` across
`apps/api/src` returns matches only inside `apps/api/src/generated/prisma/`, which is
Prisma's own generated client. Our hand-written source contains no raw SQL at all, so the
rule is satisfied by absence rather than by discipline.

### 4. No secret committed

**Pass.** `.gitignore` ignores `.env` and `.env.*`, with `!.env.example` to keep the template.
`.env.example` carries placeholders only. `packages/shared` has no secrets. The better-auth
secret, database URL and encryption key all come from the environment and are validated at
startup, so a missing one fails fast instead of running with an undefined secret.

### 5. No PII in logs

**Pass, verified.** `apps/api/src/lib/logger.ts` redacts `authorization`, `cookie`,
`idempotency-key`, `password`, `idNumber` and `email`, censoring to `[redacted]`. The logger
is for operational output only; auth events, 403s and rate-limit hits go to `SecurityEvent`
as record ids and event types. The logger is silent under `NODE_ENV=test`.

### 6. Security headers and HTTPS

**Headers: pass.** `apps/api/src/middleware/security-headers.ts` sets CSP without
`unsafe-inline` or `unsafe-eval` for scripts, `frame-ancestors 'none'`, `nosniff`,
`frameguard: deny`, HSTS and a referrer policy. Page responses get their own nonce-based CSP
from `apps/web/src/proxy.ts`. The two policies cover two different content types, HTML pages
and JSON API responses, so they are separate by design rather than duplicated by accident.

**HTTPS: deferred, tracked.** Local development runs over plain HTTP, so no redirect is
forced there. Non-local environments must terminate TLS and redirect. Recorded as gap 2 in
`SECURITY.md`.

**CSP caveat, important.** The page CSP is correct in dev and correct in any dynamically
rendered production page, but statically prerendered production pages receive no nonce,
because Next can only inject a nonce during server-side rendering. Verified directly: dev
serves 22 script tags carrying the header nonce, a production build serves inline scripts
with no nonce. Recorded in full as gap 1 in `SECURITY.md`. This does not affect the demo,
which runs under `next dev`, and it blocks any claim that production has a working strict CSP
until it is fixed.

### 8 to 17. Auth specifics

Verified by reading the installed code and the test suite rather than trusting configuration
intent:

- **8. One auth path.** All of `/api/auth/*` is `toNodeHandler(auth)`, mounted before
  `express.json()`. There are no iskole-owned auth routes, so there is no second path to keep
  in sync.
- **9. Cookie attributes.** `HttpOnly`, `Secure` in production only, `SameSite=Lax`, with the
  `iskole` cookie prefix.
- **10. Password hashing.** `@better-auth/utils` 0.5.0 uses Node `scrypt`, N=16384, r=16,
  p=1, dkLen=64, fresh salt per password. Memory-hard, not reversible.
- **11. Password policy.** 12 to 128 characters, no forced complexity, no forced rotation,
  and the Have I Been Pwned check via k-anonymity, disabled only under `NODE_ENV=test`. The
  bounds are declared locally in `apps/api/src/lib/auth.ts`; if the web form ever needs to
  state them, they should move to `packages/shared` so the two cannot drift.
- **12. No enumeration.** Sign-up and reset return the same response whether or not the
  address exists; sign-in failure is generic. Covered by dedicated tests.
- **13. Rate limiting.** Per-endpoint limits, stricter on credential routes, database-backed.
  Caveat: the limiter keys on IP, and shared IPs are common in South Africa, so a per-account
  dimension is likely needed before launch. Recorded as gap 6 in `SECURITY.md`.
- **14. CSRF.** `SameSite=Lax` plus an Origin and `Sec-Fetch-Site` check on every
  state-changing method, plus better-auth's own CSRF token on auth routes.
- **15. Deny by default.** No global auth middleware exists by design. Every route wires its
  own guard, so a new route with no guard is public, and that is visible in review rather
  than hidden behind an allowlist. Health is the only unguarded route.
- **16. Failure logging.** 403s, unverified-email and banned-user blocks all write a
  `SecurityEvent` with the record id, route and IP, never the payload.
- **17. Error handling.** `apps/api/src/middleware/error-handler.ts` returns a generic
  `internal error` plus an `errorId`, and logs the detail server-side against that id.

### 18. Dependency hygiene

**Fail, one open advisory, mitigation understood.** `pnpm audit --audit-level=high` exits
non-zero with three advisories on a single package, `lodash` 4.17.21: code injection via
`_.template` (high) and two prototype pollution issues in `_.unset` and `_.omit` (moderate).

`pnpm why` shows one chain and it never reaches the running API:

```
lodash@4.17.21
└─ @visx/* 4.0.1-alpha.0
   └─ @prisma/studio-core@0.33.0
      └─ prisma@7.10.1   (devDependency of @iskole/api)
```

`@prisma/studio-core` is Prisma Studio's component library, a browser UI bundle pulled in by
the `prisma` CLI, which is a devDependency. The vulnerable code is not loaded by the API or
by any request path.

That containment stops it being a production vulnerability. It does not make it go away,
because it will fail a CI gate the moment CI exists. The fix is owned upstream: 4.17.21 is
the newest lodash on npm and the versions the advisories name as patched, 4.17.23 and 4.18.1,
do not exist, so a `pnpm.overrides` pin would be a phantom fix. Recorded as gap 7 in
`SECURITY.md`, to be waived by GHSA id with a comment when CI is added, rather than by
lowering the audit level for the whole repository.

## What this self-check does not cover

- Features from M2 onward. Each takes this same pass when it lands.
- Object ownership, since M1 has no owned records.
- File uploads, since M1 has none.
- The AI boundary, since M1 makes no model calls.
- Production deployment configuration.

## Result

M1 passes every applicable item except dependency hygiene, which fails on one advisory that
is contained to build tooling and tracked for resolution. Two items are deferred with a named
owner and a written mitigation: HTTPS redirect, and the static-page CSP nonce.

No item in this document is marked pass on the strength of configuration alone. Each pass
cites a file I read, a test that exists, or a command whose output is quoted above.
