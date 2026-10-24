# iskole

From "what should I study?" to funded, accepted and on track. A web app for South African
learners aged 16–35: match to courses you qualify for, compare funding, apply, then keep going
with a weekly study plan.

Built for the FNB App of the Year 2026, Access to Higher Education track.

## What works

The dashboard is a six-step journey, and every step persists to PostgreSQL:

1. **Profile** — personal details, province, fields of interest and budget.
2. **Marks** — matric subjects and percentages, with an APS calculation.
3. **Match** — a deterministic eligibility filter (APS, required subjects, province, budget),
   then an AI ranking and explanation when a model is available. Falls back to the
   deterministic ranking on any AI failure.
4. **Funding** — sample bursaries and NSFAS-style options, side-by-side comparison.
5. **Applications** — create a draft, upload supporting documents (PDF/JPEG/PNG, 5 MB each),
   submit, and track events and document downloads through short-lived signed links.
6. **Study plan** — generate a weekly plan from marks and preferences, approve it, download an
   `.ics` calendar file.

Also implemented, with API coverage: expenses and budgets, privacy controls (POPIA export and
account deletion including uploaded files), clinic bookings with a capacity check, community
messages and reports, date-of-birth and guardian-consent gates for 16- and 17-year-olds, and
opt-in talent visibility for moderator-approved companies (with no contact details in the
payload and no under-18s).

Email verification is **temporarily disabled** in this build so the demo works without a
mailbox. See `SECURITY.md` gap 8 before deploying.

## Stack

- `apps/web` — Next.js 16 App Router, React 19, Tailwind 4, TypeScript.
- `apps/api` — Express 5, Prisma 7, better-auth, Zod, TypeScript.
- `packages/shared` — Zod schemas, APS rules, constants, money helpers.
- PostgreSQL 16, Mailpit, Docker Compose.
- OpenRouter for AI (zero-data-retention endpoints, provider data collection denied; optional,
  and the app degrades gracefully without a key).
- Vitest for API and package tests, Playwright for the browser smoke test.

## Run it locally

Prerequisites: Node 22+, pnpm 12+, Docker.

```bash
# 1. Environment. Fill in the three 32-byte secrets; OPENROUTER_API_KEY is optional.
cp .env.example .env

# 2. Install
pnpm install

# 3. Database and mail catcher
pnpm dev:db

# 4. Schema and sample data (5 institutions, 8 courses, 4 funding options, 15 clinic slots)
pnpm --filter @iskole/api exec prisma migrate deploy
pnpm --filter @iskole/api seed

# 5. Two terminals
pnpm dev:api   # http://localhost:8004
pnpm dev:web   # http://localhost:3004
```

Open http://localhost:3004 and create an account. Mailpit, if you want to see reset emails,
is at http://localhost:8025.

The test database is separate (`iskole_test`). Create it once:

```bash
docker compose exec postgres createdb -U iskole iskole_test
```

Tests apply the committed migrations to it automatically and never touch the development
database.

Generate secrets however you prefer; the example assumes OpenSSL:

```bash
openssl rand -base64 32
```

`TRUST_PROXY_HOPS=1` is correct for the local Next.js rewrite. Set it to `0` only if the API is
exposed directly.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test          # shared + API (Vitest), 207 tests at the time of writing
pnpm test:e2e      # Playwright browser smoke test; needs the dev servers or starts them
pnpm build         # API bundle + Next production build
```

The first Playwright run needs a browser:

```bash
pnpm exec playwright install chromium
```

The browser test creates a learner, checks the session survives the Next rewrite, clears the
cookie and signs back in, then deletes the account. Business rules stay in the faster API
suite; the browser test covers the cookie and rendering boundary those tests cannot.

## Security and POPIA

Security is the first constraint, not a later pass, because the app handles minors, ID numbers
and application documents.

- `SECURITY.md` — threat model, POPIA position, known gaps. Read this before deploying.
- `docs/owasp-self-check-m1.md` — evidence-backed OWASP pass for authentication.
- `docs/owasp-self-check-journey.md` — pass for the journey, uploads, signed downloads,
  idempotency, AI boundary and POPIA controls.

Highlights: better-auth is the only auth path; role comes from the session only; Zod validates
every structured request; Prisma is the only database path; uploads are type-checked by magic
bytes, stored outside the web root and served only through five-minute HMAC-signed URLs;
state-changing POSTs require an idempotency key; AI prompts contain academic context only, are
routed only to zero-data-retention endpoints with provider data collection denied, and degrade
to deterministic results; a COMPANY role still needs a moderator-created approval
before candidate search opens; date of birth and guardian consent gate applications for
under-18s, and under-18s are excluded from company search.

## Sample data

Funding option descriptions start with "Sample", and clinic slots are seed data. Amounts and
deadlines are illustrative and must be checked against the provider. The footer of the app
says "Sample, verify before use" for the same reason.

Nothing is transmitted to a university, NSFAS or a funder. "Submit" records the application
and its status in iskole; it is not an external receipt. See `SECURITY.md` for the full
position.

## Known gaps

The short list, with detail and evidence in `SECURITY.md`:

- Email verification is off for the demo (gap 8).
- Age and guardian consent are self-declared: the date of birth is not verified and nobody
  contacts the guardian (gap 14).
- Journey screens are English-only; isiZulu strings exist for the landing/auth screens but
  there is no language switch yet (gap 9).
- The offer lifecycle after submission is not implemented: no issuer, accept or decline
  route (gap 10).
- Document storage is local disk, and uploads are not virus-scanned (gaps 12 and 13).
- AI inference is zero-data-retention, but not guaranteed to run in South Africa; production
  still needs a POPIA section 72 cross-border transfer assessment.
- Production still needs HTTPS, a fix for the static-page CSP nonce, dependency-audit
  sign-off and CI (gaps 1–7).
