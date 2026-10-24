# OWASP self-check: journey, documents and POPIA controls

Scope: the features built after M1, through the document upload path and the study-plan
screen. The authentication spine has its own pass in `owasp-self-check-m1.md`; this document
does not repeat it, but it does re-check the controls the new routes rely on.

Rules are the same as the M1 document: a pass needs evidence that was read or run, not a
setting remembered from earlier. Anything unverified says so. Anything still open is a fail
or a documented gap, even when the fix is scheduled.

Date: 2026-10-22. Environment: local development, `next dev` on 3000, Express on 4010,
PostgreSQL in Docker.

## Summary

| # | Check | Verdict |
|---|---|---|
| 1 | Authorization by role and ownership on every learner record | Pass |
| 2 | External input validated before use | Pass, with two typed public GET filters |
| 3 | No raw or string-built SQL | Pass |
| 4 | No secret hardcoded or committed | Pass |
| 5 | No PII or secrets in logs | Pass |
| 6 | Security headers, CSP and clickjacking | Pass in dev; production static-page CSP remains gap 1 |
| 7 | File uploads validated by content, size-limited, outside web root | Pass; no AV scan (gap 13) |
| 8 | Document download authorised and short-lived | Pass |
| 9 | Idempotency on creating and submitting POSTs | Pass |
| 10 | CSRF protection on state-changing routes | Pass |
| 11 | Rate limiting and proxy trust | Pass with a shared-IP caveat (gap 6) |
| 12 | Generic errors, no stack traces, safe body limits | Pass |
| 13 | POPIA export and deletion, including files | Pass |
| 14 | AI boundary: no PII, validated output, graceful fallback | Pass |
| 15 | No account enumeration | **Fail while email verification is off** (gap 8); pass when enabled |
| 16 | Dependency hygiene | **Fail on one contained `lodash` advisory** (gap 7) |

## Evidence

### 1. Authorization

`apps/api/src/middleware/auth.ts` exposes `requireSession` and `requireRole`; role comes from
the session row, never from the request. Every application, document, expense, budget, study
plan, booking, message and privacy route resolves the session and scopes the query by
`userId` or checks `application.userId` before acting. Cross-user attempts in
`tests/documents.test.ts`, `tests/features.test.ts` and `tests/golden-path.test.ts` return 403
or 404 rather than the other learner's data. Public reads are limited to courses,
institutions, active funding options and clinic slots, none of which contain learner data.

`e2e/auth.spec.ts` checks the browser boundary the API tests cannot: a real Chromium session
signs up through the Next rewrite, the server-rendered dashboard reads the forwarded cookie,
clearing the cookie signs the learner out, and signing back in works. It then deletes the
account through the POPIA endpoint, so the test also exercises deletion with a real session.

Company access has a second gate beyond the role: a COMPANY account must have an approved
`CompanyProfile`, created by a MODERATOR or ADMIN through
`POST /api/admin/companies/:userId/approve`. A role change alone returns 403. The approval
row is audited. `tests/features.test.ts` covers unapproved 403, a learner attempting to
approve, a moderator approving, a non-company target and the opt-in-only candidate payload.

### 2. Input validation

Routes that accept structured input call a Zod schema from `packages/shared`:
`ApplicationCreateSchema`, `profileUpdateSchema`, `markCreateSchema`, `ExpenseCreateSchema`,
`BudgetCreateSchema`, `BookingSchema`, `CommunityCreateSchema`, `MessageCreateSchema`,
`ReportCreateSchema`, `TalentVisibilitySchema`, `DeleteAccountSchema`,
`FundingCompareQuerySchema`. Errors become 400s through `error-handler.ts`.

Two public GET filters, `courses` (`field`, `province`, `q`) and `aps` (`field`), type-check
their query strings with `typeof === 'string'` rather than a Zod enum. They are not an
injection path because Prisma parameterises the values and an unknown enum simply matches
nothing, but they are not schema validation and are recorded here as such rather than
described as a full pass.

The document upload is the deliberate binary exception: it is validated by byte signature,
declared content type, byte length and a per-application count, not by Zod. That is the
correct tool for a file.

### 3. SQL injection

No `$queryRaw`, `$executeRaw`, `$queryRawUnsafe` or `$executeRawUnsafe` in hand-written
source; matches exist only in `apps/api/src/generated/prisma/`. All access goes through the
Prisma client in `apps/api/src/lib/prisma.ts`.

### 4. Secrets

`.env` is gitignored; `.env.example` holds placeholders. `apps/api/src/lib/env.ts` validates
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `SIGNING_SECRET`, `ID_ENCRYPTION_KEY` and the rest at
boot, so a missing secret fails fast. No key is read from a route or embedded in the web
bundle.

### 5. Logs

`apps/api/src/lib/logger.ts` redacts authorization, cookie, idempotency key, password, ID
number and email. Security events store user id, event type, route and IP, never payloads.
Document logging does not include file contents or storage keys.

### 6. Headers

`apps/api/src/middleware/security-headers.ts` sets CSP, `frame-ancestors 'none'`, `nosniff`,
HSTS and a referrer policy for API responses. The web app sets its own nonce-based CSP in
`apps/web/src/proxy.ts`. Downloads additionally force `Content-Disposition: attachment` and
`Cache-Control: private, no-store`.

The known limitation is unchanged: statically prerendered production pages do not receive a
nonce (SECURITY.md gap 1). The demo runs under `next dev`, where the nonce is present.

### 7. Uploads

`apps/api/src/lib/storage.ts` decides the type from the first bytes (`%PDF-`, JPEG SOI, PNG
signature), not from the client header. The route caps the body at 5 MB with `express.raw`,
allows at most 10 documents per application, writes under `UPLOAD_DIR/documents/<userId>`
with `wx` and mode `0o600`, and generates the key server-side. The file name is sanitised to
a display label. `tests/documents.test.ts` covers a valid PDF, a mislabelled HTML file, a
cross-user upload, the post-submission refusal and the per-application limit behaviour.

No antivirus scan yet; recorded as SECURITY.md gap 13.

### 8. Downloads

Issuing a link requires a session and `document.application.userId === session.user.id`.
The link is an HMAC-SHA256 over `<documentId>.<expires>` with `SIGNING_SECRET`, valid for
five minutes. Verification rejects a non-integer or past expiry, an expiry more than one
minute beyond the TTL, a wrong length and any non-constant-time mismatch. The download route
needs no session because the signature is the credential, like a presigned object URL. The
resolved path is checked against the storage root again before `sendFile`, so a corrupt row
cannot read outside it.

Covered end to end in `tests/documents.test.ts`: exact bytes, anonymous link issuance 401,
another learner 403, tampered signature 403, expired signature 403.

### 9. Idempotency

`apps/api/src/middleware/idempotency.ts` scopes keys per user, hashes method, path and body,
stores the response and replays it, and returns 422 when the same key is reused with a
different body. Uploads hash the raw bytes with SHA-256 instead of serialising a Buffer as a
JSON array. The upload test replays the same key and asserts one row and one file.

### 10. CSRF

`apps/api/src/middleware/csrf.ts` rejects state-changing requests whose `Origin` is not the
app origin or whose `Sec-Fetch-Site` is cross-site; better-auth also enforces its own origin
check and token for auth routes. `tests/csrf.test.ts` covers the rejection paths. The document
upload is a same-origin `fetch`, so it carries the session cookie and passes the check.

### 11. Rate limiting

A 600-requests-per-15-minutes global limiter wraps every route. Better-auth applies stricter
limits to credential routes, and AI routes add a per-account daily cap because IP-only
limits fail behind shared NAT. `TRUST_PROXY_HOPS` defaults to 0; it is set to 1 locally so
the API reads the browser address forwarded by the Next rewrite instead of putting every
learner in the proxy's bucket. Setting it higher than the real number of proxies would let a
client spoof its address, so it is a configured hop count, not `trust proxy: true`.

Per-IP limits still share a budget behind one NAT. Recorded as gap 6.

### 12. Errors

`apps/api/src/middleware/error-handler.ts` returns a generic `internal error` plus an
`errorId` and logs the detail server-side. Zod errors return field paths and messages only.
JSON parse failures return 400, oversized bodies return 413 (added with the upload route),
and `HttpError` messages are client-safe. No stack trace reaches a response.

### 13. POPIA

`apps/api/src/routes/privacy.ts` exports the learner's own profile, preferences, marks,
applications (including document metadata), expenses, budgets, study plans, bookings,
authored messages, date of birth and guardian consent record. It never exports ID-number
ciphertext, password hashes, sessions or other learners' rows. Deletion requires the literal
confirmation `DELETE`, records a `SecurityEvent`, deletes the user rows by cascade, then
removes the bytes of every document the learner uploaded. `tests/documents.test.ts` asserts
the file is gone from disk after deletion; `tests/features.test.ts` covers export and the
confirmation requirement.

The age rules are server-side. A date of birth is collected at sign-up and stored on the
profile. A learner under 16 is rejected; a 16- or 17-year-old cannot open or submit an
application until `PUT /api/privacy/guardian-consent` records a guardian's name, contact and
explicit confirmation. Turning on company visibility requires a date of birth proving 18+, and the
candidate query excludes anyone younger and anyone with no date of birth, regardless of the
opt-in. `tests/age-consent.test.ts` covers each gate, including that a minor with guardian
consent still never appears in company search. The residual limitation is verification: the
date and guardian contact are self-declared (SECURITY.md gap 14).

### 14. AI boundary

`apps/api/src/lib/ai/guard.ts` rejects prompts containing a 13-digit ID, an email address, a
long digit run or over-long text, and the callers send academic context only (APS, subject
marks, chosen fields). Output is parsed and Zod-validated in `lib/ai/json.ts`. Every request
sets `provider.zdr: true` and `provider.data_collection: 'deny'`, so OpenRouter routes only to
endpoints that retain nothing; all configured models have ZDR endpoints. App attribution is
marked hidden, so the learner-facing app does not appear in public rankings. When the provider
is unavailable or returns invalid JSON, matching and study plans fall back to a deterministic
result and the UI says the assistant was unavailable. A prompt rejected by the guard is handled
the same way, so conservative PII detection cannot turn into a 500. Covered by
`tests/ai-guard.test.ts` and `tests/ai-client.test.ts`. ZDR limits retention, not processing
location; a production POPIA cross-border transfer assessment is still required.

### 15. Account enumeration

With `REQUIRE_EMAIL_VERIFICATION = false` (the current build), a duplicate sign-up returns a
distinct error and the sign-up screen can probe which addresses exist. This is a real,
temporary failure, asserted conditionally in `tests/auth.test.ts` and recorded as SECURITY.md
gap 8. Flipping the flag to `true` restores both the sign-in block and the uniform sign-up
response.

### 16. Dependencies

`pnpm audit --audit-level=high` still reports the `lodash` 4.17.21 advisory reached only
through Prisma Studio (a devDependency). It is contained, not fixed; SECURITY.md gap 7
records the chain, the GHSA id and the CI waiver plan.

## Result

Every applicable control passes except account enumeration while verification is disabled
and the contained tooling advisory. The demo can run with the journey, document upload,
signed downloads, the age gate and guardian-consent gates, and POPIA deletion working. It
must not be presented as production-ready until gaps 1 (static-page CSP), 2 (HTTPS), 7
(audit), 8 (verification), 9 (journey translation), 12 (shared document storage), 13 (AV
scanning) and 14 (verified age and guardian contact) are closed.
