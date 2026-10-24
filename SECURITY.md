# iskole security notes

iskole holds personal data for learners aged 16 to 35, including minors, so it falls under
POPIA. Security comes before speed and before features. This file records the threat model,
the POPIA position, and the known gaps we have not closed yet.

It is a living document. Every milestone updates it. The evidence-backed OWASP passes live
in `docs/owasp-self-check-m1.md` (authentication spine) and
`docs/owasp-self-check-journey.md` (journey, documents and POPIA controls).

## How to read this

- The threat model table states the control we rely on for each threat, and the test that
  proves the control works. A control with no test is a claim, not a control.
- Anything in **Known gaps** is a real, acknowledged weakness. We do not hide these and we do
  not claim integrations that do not exist. If something is simulated, it says so.
- No entry may ever contain a real learner's data. Sample data is labelled.

## Trust boundaries

| Boundary | What crosses it | Control |
|---|---|---|
| Browser to web app | Page requests, form input | One origin, CSP with a per-request nonce, no `unsafe-inline` or `unsafe-eval` for scripts in production |
| Web app to API | `/api/*`, rewritten to Express | Same origin, so the session cookie stays first-party and `SameSite=Lax` |
| API to database | All reads and writes | Prisma only, parameterised by construction, no raw or string-built SQL |
| API to email provider | Verification and reset links | Server-side only, recipient user id logged, never the address or body |
| API to AI provider | Academic context only: APS, subject marks, chosen fields | API side only; `redactForPrompt` rejects ID numbers, emails, phone numbers and over-long text; no names, contact details or other users' data; requests are pinned to zero-data-retention endpoints with provider data collection denied; output schema-validated |
| Learner to company | Talent search (no contact details) | Opt-in only via `talentVisible`; a COMPANY role plus a moderator-approved `CompanyProfile`; the payload has no email, phone or ID number; profiles without a date of birth proving 18+ are excluded |
| Unauthenticated caller | Anything | Deny by default: every route wires `requireSession` then `requireRole` itself. Public reads are limited to courses, institutions, active funding options and clinic slots, none of which carry learner data |
| Learner file to API | Documents for an application | PDF/JPEG/PNG by magic bytes, 5 MB cap, 10 per application, server-generated storage key outside the web root, metadata-only reads |
| Downloader to API | A document download | HMAC-signed URL bound to document id and expiry, five-minute lifetime, constant-time comparison, ownership check before issuance |

## Threat model

| Asset | Threat | Control | Test |
|---|---|---|---|
| Session cookie | Theft via cross-site script | `HttpOnly`, `Secure` in production, `SameSite=Lax`, cookie prefix `iskole` | `tests/auth.test.ts` cookie shape; header check |
| Session cookie | Forgery with a guessed token | better-auth signs the cookie; unsigned cookies are rejected | `tests/auth.test.ts` "returns 401 for a cookie that was never signed by better-auth" |
| Account | Privilege escalation by a client-set role | Role comes from the session only; better-auth rejects a `role` field in the sign-up body with 400 `FIELD_NOT_ALLOWED` | `tests/auth.test.ts` "rejects a sign-up that tries to set its own role" |
| Account | Signing in without a verified email | **Temporarily disabled** in this build (`REQUIRE_EMAIL_VERIFICATION = false`). When enabled, better-auth refuses sign-in and `requireSession` re-checks `emailVerified`. The tradeoff is recorded as gap 8 | `tests/auth.test.ts` "enforces the unverified-email rule only when verification is enabled" |
| Account | Brute force and credential stuffing | Per-endpoint rate limits, stricter on credential routes; failed and successful sign-ins recorded | `tests/auth.test.ts` rate limiting; `SecurityEvent` rows |
| Account | Use of a breached password | Have I Been Pwned plugin, on in dev and production | Plugin config in `apps/api/src/lib/auth.ts`; disabled under test only |
| Account | Email enumeration | With verification on, sign-up and reset return the same response whether or not the address exists. With it off, a duplicate sign-up is distinguishable: a temporary, documented failure (gaps 8 and 15) | `tests/auth.test.ts` enumeration tests, which run the strict assertions only when the flag is on |
| Account | Session reuse after a password reset | `revokeSessionsOnPasswordReset`, and guarded routes read through to the database rather than the cookie cache | Config in `apps/api/src/lib/auth.ts`; `disableCookieCache` in the guards |
| Verification and reset tokens | Working links from a database leak | Tokens stored hashed (`storeIdentifier: 'hashed'`) | `apps/api/src/lib/auth.ts` verification config |
| Learner records | Horizontal access to another learner's data | Object-level ownership checks, deny by default, in the data layer with the user id as first argument | Per-route tests: someone else's resource is 403 or 404 |
| Company access | A COMPANY account searches learner talent without vetting | COMPANY role plus an approved `CompanyProfile`; only a MODERATOR or ADMIN can create the approval; only opted-in profiles are returned, with no contact details | `tests/features.test.ts` "gates company search behind moderator approval and shows only opted-in learners" |
| Minors | An under-18 learner uses adult features without guardian consent | A date of birth is required before applying or opting in. Under-18s need a guardian consent record before opening or submitting an application, and are blocked from company visibility regardless of consent. The date is self-declared (gap 14) | `tests/age-consent.test.ts` |
| Learner records | Vertical access by the wrong role | `requireRole` after `requireSession`, 403 recorded as a `SecurityEvent` | `tests/auth.test.ts` "returns 403 for the wrong role once signed in" |
| Learner records | Injection through input | Zod validation of every external input, schemas in `packages/shared` | Per-route 400 tests |
| Learner records | Injection into SQL | Prisma only, never `$queryRawUnsafe`, never string-built SQL | Lint and review; no raw SQL in the codebase |
| Minors' data | Being approached by companies | Under-18s never appear in company search; a date of birth proving 18+ is required, and a minor can still withdraw visibility | `tests/age-consent.test.ts` |
| ID numbers | Exposure in a breach | AES-256-GCM at rest, key per environment, never logged, never sent to AI; collected only when an application needs it | `tests/crypto.test.ts` round-trip and tamper tests |
| Documents | Unauthorised download | Short-lived signed URL after an ownership check; file metadata only in list responses; storage key never leaves the server | `tests/documents.test.ts` "issues a signed link that downloads the exact bytes, and rejects tampering or expiry" |
| Documents | A mislabelled executable or stored XSS | Magic-byte check, not the client's Content-Type; PDF/JPEG/PNG only; forced `attachment` disposition; `nosniff`; 5 MB and 10-document caps | `tests/documents.test.ts` "rejects a file whose bytes are not a PDF, JPEG or PNG" |
| Documents | Reading another learner's application folder | Ownership check on upload and on link issuance; signed download is the only read path; the resolved path is re-checked against the storage root | `tests/documents.test.ts` ownership and account-deletion tests |
| Documents | Left behind after account deletion | Account deletion collects storage keys, deletes the rows, then removes the bytes | `tests/documents.test.ts` "deletes the stored file when the learner closes their account" |
| Duplicate submissions | Double applications, uploads and bookings | `Idempotency-Key` on every creating or submitting POST, per user, request hash (byte hash for uploads), cached response, 24h TTL; same key with different content is 422 | `tests/documents.test.ts` replay test; `tests/features.test.ts`; `tests/golden-path.test.ts` |
| Rate limiting | Spoofed `X-Forwarded-For`, or every learner sharing one proxy bucket | `TRUST_PROXY_HOPS` defaults to 0 and is set to the real hop count; AI calls also have a per-account daily cap, not just per IP | `apps/api/src/lib/env.ts`, `apps/api/src/app.ts`, `apps/api/src/lib/ai/guard.ts` |
| Logs | PII leaking into log storage | Log record ids and event types, never names, emails, ID numbers or message bodies; Pino redaction | `apps/api/src/lib/logger.ts` redaction config |
| Dependencies | Known vulnerable package | Exact versions, `pnpm audit` in CI, reviewed build-script allowlist | `pnpm audit --audit-level=high` (passes; override in place for transitive) |
| Whole app | Clickjacking | `frame-ancestors 'none'` and `frameguard: deny` | Header checks |
| Money and clinic | Unauthorised access or booking abuse | Owner-scoped queries, role STUDENT, serialisable transaction for booking capacity, fixed booking reasons, idempotency on creates | `apps/api/tests/money-wellness.test.ts`, `apps/api/tests/role-ownership-matrix.test.ts` |
| Notifications and privacy | Cross-user access to nudges or private data | Owner-scoped reads/writes, 404 on not found/not owned, export excludes sensitive data, account deletion removes files and records event | `apps/api/tests/privacy-notifications.test.ts`, `apps/api/tests/role-ownership-matrix.test.ts` |
| Demo endpoints | Accidental enablement in production | DEMO_MODE defaults to false in production, handler returns 404 when off, not present as true in `.env.example` | `apps/api/tests/offers-demo-mode-off.test.ts` |

## POPIA position

- **Lawful basis.** Consent for iskole's own processing is captured at sign-up, which is for
  learners aged 16 and over. The date of birth is collected with the account and saved on the
  profile. Under-18s must record a parent or guardian's name and contact and an explicit
  confirmation before an application is opened or submitted; company visibility is off for
  under-18s whether or not consent exists. The date of birth and guardian contact are
  self-declared and not independently verified (gap 14).
- **Purpose limitation.** Data is used to match learners to courses and funding, to record
  their applications and status, and to support them through study. Nothing else.
- **Minimality.** The ID number is collected only where an application requires it, not at
  sign-up. Documents are collected only when a specific application asks for them.
- **Security safeguards.** Encryption of ID numbers at rest, hashed verification tokens,
  hashed passwords, least-privilege access by role, documents stored outside the web root
  behind short-lived signed URLs, and a written audit trail.
- **Data subject rights.** Export and deletion are implemented for the golden path. Export
  covers the profile (including date of birth), guardian consent record, preferences, marks,
  applications (including document metadata), expenses, budgets, money plan, `remindMe` flags,
  clinic bookings (with reason), notifications, study plans and authored community messages;
  it excludes encrypted ID material, password hashes, sessions and other learners' data.
  Consent history includes `grantedAt`/`revokedAt` with policy version. Deletion removes the
  learner's rows, then removes the bytes of their uploaded documents from disk, and records a
  `SecurityEvent` without personal content.
- **Operators.** Email delivery and the AI provider are operators. Neither receives more than
  the minimum, and the AI provider receives academic context only: no names, emails, phone
  numbers, ID numbers or other learners' data. AI requests set `provider.zdr: true` and
  `provider.data_collection: 'deny'`, so inference is routed only to endpoints that retain
  nothing. OpenRouter prompt logging must also remain off in the account settings.
  ZDR limits retention, not processing location: the provider may process the request outside
  South Africa, so production needs a POPIA section 72 cross-border transfer assessment.
- **Retention.** Applications and study plans are kept while the learner is active. Deleted
  accounts are removed rather than soft-deleted, except for security events, which are kept
  as a record of misuse without personal content.

## Integrations that are not live

The demo does not transmit anything to an institution, NSFAS or a funder. Saying so plainly
matters more than looking complete:

- **Institution applications.** "Submit" records a status transition and an
  `ApplicationEvent` in iskole's own database. No file is sent to a university, and there is
  no external receipt id. The UI therefore says the application was submitted in iskole and
  that status changes will appear there; it does not claim an institution has received it. A
  live integration would need an institution-specific adapter, a consent record and a stored
  receipt.
- **Funding.** `FundingOption` rows are sample data. Each description starts with "Sample"
  and the UI footer says "Sample, verify before use". There is no application-to-funder
  integration.
- **Offers.** The schema has `OfferLetter` and the API returns an offer only to the learner
  who owns the application, but no route yet lets a company or moderator issue one. The offer
  lifecycle after `SUBMITTED` is recorded as gap 10.

## Known gaps

Real, acknowledged, not yet closed. Ordered by how much they matter.

1. **Nonce-based CSP does not cover statically prerendered pages.** Next applies nonces
   during server-side rendering, from the CSP header on the request. Pages that are
   statically generated at build time have no request headers, so they are served with
   inline scripts that carry **no nonce**: the Turbopack chunk registry and the React Server
   Components streaming payload (`self.__next_f.push(...)`). Under a `script-src` with
   `'strict-dynamic'` and no nonce and no `'unsafe-inline'`, a strict browser blocks both,
   which can break hydration.

   - Verified: in dev the pages are dynamically rendered and every script tag carries a nonce
     matching the header. In a production build the pages are static (`○ /`, `○ /signup`) and
     no nonce is emitted at all.
   - This affects deployment only. The demo runs under `next dev`, where nonces work.
   - Not caused by the dev-only `unsafe-eval` change, and not related to it. It predates it.
   - Options when we are closer to deploying: force dynamic rendering on the affected pages
     with `await connection()`, which the Next CSP guide prescribes, at the cost of losing
     static optimisation and CDN caching; or move to hash-based CSP with the experimental
     `experimental.sri` flag, which keeps pages static and would let the nonce logic shrink.
   - Until then no production deployment may be presented as having a strict, working CSP.

2. **HTTPS redirect is deferred.** Helmet and the app do not force an HTTPS redirect in
   local development, because local development runs over plain HTTP. Non-local environments
   must terminate TLS and redirect. This is a deployment configuration step, not code.

3. **CI does not run the browser suite or a secrets scan yet.** `.github/workflows/ci.yml`
   runs lint, typecheck, Vitest and the production build on every push and pull request, and
   a separate job fails on high or critical `pnpm audit` findings. Playwright still depends
   on a local Mailpit/Postgres pair and is run by hand before submission; a dedicated
   gitleaks job is also still to be added.

4. **The local test database is not ephemeral.** Tests run against `iskole_test` on the local
   Postgres. It is migrated before the suite and rate-limit counters are cleared between
   tests. It is not torn down per run, so it accumulates rows. CI uses a disposable Postgres
   service, so the enforced path is clean; local convenience is the only exception.

5. **`style-src` allows `'unsafe-inline'`.** Browsers require it for inline `style`
   attributes, and Next's own production example omits it in favour of a nonce. Ours is
   therefore looser than Next recommends. Styles are not the primary XSS vector, so this is
   low risk, but it should be tightened and verified against a production build.

6. **Rate limiting is per IP.** The global limiter and better-auth's limiter key on the IP,
   so learners behind one NAT or mobile carrier address share a budget. In South Africa
   shared-IP situations are common. `TRUST_PROXY_HOPS` (default 0) makes the API read the
   real client address behind the Next rewrite or one load balancer instead of treating the
   proxy as every learner, which fixes the local and single-proxy case. It does not fix
   shared NAT. AI routes also have a per-account daily cap; the remaining routes still need
   a per-account dimension before launch.

7. **Resolved: the `lodash` advisory is pinned out.** `lodash` is reached only through
   Prisma Studio, a dev-only transitive of the `prisma` CLI. The vulnerable range was
   `<=4.17.23` (code injection via `_.template`, GHSA-r5fr-rjxr-66jc). `pnpm-workspace.yaml`
   now carries `overrides: { lodash: ^4.18.1 }`, and `pnpm audit --audit-level=high` reports
   no known vulnerabilities. The override is a real pin, not an ignore rule; it must be
   removed once Prisma resolves a patched version itself.

8. **Resolved: email verification is on.** `REQUIRE_EMAIL_VERIFICATION` in
   `apps/api/src/lib/auth.ts` is `true`. better-auth now refuses sign-in until the address
   is verified, `sendOnSignUp` and `sendOnSignIn` send the link, the verification link
   creates a session, and `requireSession` re-checks `emailVerified` on every guarded route.
   Sign-up is enumeration-resistant again because a duplicate returns the same success
   response as a new address. The seeded `demo@iskole.app` account is pre-verified so a judge
   is not blocked by SMTP; real sign-ups still need a working mailbox.

9. **The journey screens are English-only.** `apps/web/src/i18n/strings.ts` has English and
   isiZulu drafts for the landing and auth screens, but every page currently calls
   `getDict('en')` and there is no language switch in the UI. Shop-window screens can be
   translated, but a learner who cannot read English cannot complete the journey yet. The
   isiZulu strings are first drafts and need a fluent reviewer before they are shown. This is
   the largest unmet product requirement and is deliberately not half-shipped: a switch that
   leaves the profile, marks, match, funding, applications and study-plan screens in English
   would look translated without being usable.

10. **The offer lifecycle after submission is not implemented.** `SUBMITTED` is the last
    transition a route can make. There is no company or moderator endpoint to issue an
    `OfferLetter`, and no accept/decline route or UI. The application status vocabulary
    already includes `UNDER_REVIEW`, `OFFER_ISSUED`, `ACCEPTED` and `DECLINED`, and the UI
    renders those labels, but nothing sets them yet. A company portal is also absent.

11. **Community API-only.** Community messages and reports,
    community messages/reports have working, tested API routes and persistent storage, but
    only the study plan has a screen. A learner cannot reach the other features from the
    dashboard yet. They are safe to leave dark; they are not pretending to exist.

12. **Document storage is local disk, not object storage.** `apps/api/src/lib/storage.ts`
    writes under `UPLOAD_DIR` and signs URLs to the API. That is correct for one instance
    and for the demo, but a multi-instance deployment without a shared volume would issue a
    link to an instance that may not hold the file. Production should use S3-compatible
    storage with a server-side encryption policy; the signing and ownership layer can stay.

13. **Uploads are not virus-scanned.** Magic bytes, an allowlist, size caps and forced
    download stop a renamed HTML or SVG file from becoming stored XSS, but a syntactically
    valid PDF can still carry a malicious payload for a desktop reader. Add an asynchronous
    AV scan (or a managed upload service) before documents are shared with institutions.

14. **Age and guardian consent are self-declared.** The app now asks for a date of birth at
    sign-up, stores it on the profile, rejects under-16s, requires a guardian name and contact
    for 16- and 17-year-olds before an application can be opened or submitted, and excludes
    under-18s (and profiles with no date of birth) from company search. What remains is
    verification:
    a learner can enter a false date of birth, and nobody contacts the guardian to confirm the
    consent. There is also no revoke-and-reconfirm flow beyond updating the record. Closing
    the gap needs a verified identity or date of birth at sign-up (for example a cellphone or
    ID check), a guardian verification step, and a consent audit trail with revocation. Until
    then, treat age and guardian consent as asserted, not proven. The behavioural rules are
    tested in `tests/age-consent.test.ts`.

## Verified during the M1 self-check

Confirmed by reading the installed code rather than assuming, so the claims below are load
bearing and not just configuration intent:

- **Password hashing is a real memory-hard KDF.** `@better-auth/utils` 0.5.0
  (`dist/password.node.mjs`) uses Node's `scrypt` with N=16384, r=16, p=1, dkLen=64, and a
  fresh 16-byte random salt per password, stored as `salt:key`. It is not a reversible
  encoding. This satisfies the "verify it uses bcrypt/argon2 or equivalent under the hood"
  requirement in the OWASP skill.
- **No raw SQL anywhere in our code.** Every `queryRaw` and `executeRaw` match in the repo is
  inside Prisma's own generated client at `apps/api/src/generated/prisma/`. Our own source
  has no raw SQL at all.
