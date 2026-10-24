# OWASP self-check: M5 and M6 (money, wellness/clinic, privacy and notifications)

Milestone M5 covers money plans, expenses and budgets with `remindMe`, clinic slots and bookings with a fixed reason, and the demo nudge trigger. M6 covers the privacy centre (consents with history, export, account deletion), notifications, and static privacy pages.

This document follows the same format as `docs/owasp-self-check-m1.md` and `docs/owasp-self-check-journey.md`: a verdict of pass requires evidence I read or ran, not intent. Items unverified say so. Routes are covered one by one where added.

Date: 2026-10-23. Scope: M5 and M6 only.

## Summary

| # | Check | Verdict |
|---|---|---|
| 1 | Authorization checked server-side by role, and by ownership where a record is involved | Pass |
| 2 | All external input validated via a Zod schema before use | Pass |
| 3 | No raw or string-built SQL with user input | Pass |
| 4 | No secret or key hardcoded or committed | Pass |
| 5 | No PII or secrets in logs | Pass |
| 6 | Security headers present, HTTPS enforced outside local dev | Pass for headers, HTTPS deferred (gap 2) |
| 7 | File uploads validated by content, size-limited, outside web root | Not applicable |
| 8 | CSRF protection on state-changing routes | Pass |
| 9 | Idempotency on creating/submitting POSTs | Pass for expense, budget, clinic booking and demo trigger |
| 10 | Object ownership (cross-user reads return 404, not 403) | Pass |
| 11 | No PII in AI prompts or notifications | Pass |
| 12 | Demo-only endpoints return 404 when DEMO_MODE is off | Pass (tested) |

## Routes covered

### Money
| Route | Method | Guard | Notes |
|---|---|---|---|
| `/money/plan` | GET | requireSession, requireRole('STUDENT') | Owner-scoped via `userId`. Upserts a default plan. |
| `/money/plan` | PUT | requireSession, requireRole('STUDENT') | `PaydayInputSchema` parsed. Validates payday range (0 or 1-31). |
| `/expenses` | GET | requireSession, requireRole('STUDENT') | User-scoped, ordered by `spentAt`. |
| `/expenses` | POST | requireSession, requireRole('STUDENT'), idempotent() | `ExpenseInputSchema`. `remindMe` is explicit. Amount stored in cents. |
| `/expenses/:id` | DELETE | requireSession, requireRole('STUDENT') | Owner check: query by `id` and `userId`; returns 404 if not found or not owned. |
| `/budgets` | GET | requireSession, requireRole('STUDENT') | Owner-scoped. |
| `/budgets` | POST | requireSession, requireRole('STUDENT'), idempotent() | `BudgetInputSchema`. Unique by (userId, category, period). |
| `/budgets/:id` | DELETE | requireSession, requireRole('STUDENT') | Owner check via `deleteMany({ where: { id, userId } })` semantics; 404 if not owned. |

Evidence: `apps/api/src/routes/money.ts`, `apps/api/src/routes/expenses.ts`, `apps/api/tests/money-wellness.test.ts`, `packages/shared/src/money.ts`.

### Wellness / Clinic
| Route | Method | Guard | Notes |
|---|---|---|---|
| `/clinic/slots` | GET | none (public) | Upcoming slots only. Capacity counts bookings. No learner data returned. |
| `/clinic/bookings` | POST | requireSession, requireRole('STUDENT'), idempotent() | `ClinicBookingInputSchema` requires a fixed `reason` (enum). Serializable transaction checks slot start, capacity. Unique (slotId,userId) returns 409. |
| `/clinic/bookings` | GET | requireSession, requireRole('STUDENT') | Owner-scoped list, includes slot info and reason. |
| `/clinic/bookings/:id` | DELETE | requireSession, requireRole('STUDENT') | Ownership verified; 404 if not found or not owned, 403 avoided. Idempotent (cancelled returns 204). |

Evidence: `apps/api/src/routes/clinic.ts`, `apps/api/tests/money-wellness.test.ts`, `apps/api/tests/features.test.ts` (updated for reason).

### Privacy
| Route | Method | Guard | Notes |
|---|---|---|---|
| `/privacy/talent-visibility` | GET | requireSession, requireRole('STUDENT') | Owner-scoped. |
| `/privacy/talent-visibility` | PUT | requireSession, requireRole('STUDENT') | Explicit opt-in. |
| `/privacy/guardian-consent` | GET | requireSession, requireRole('STUDENT') | Owner-scoped. |
| `/privacy/guardian-consent` | PUT | requireSession, requireRole('STUDENT') | Zod validation. |
| `/privacy/consents` | GET | requireSession, requireRole('STUDENT') | Returns history including `grantedAt`/`revokedAt`. No `granted` boolean. |
| `/privacy/consents` | POST | requireSession, requireRole('STUDENT') | `ConsentUpdateSchema`. Purposes: ESSENTIAL, AI_STUDY_PLAN, TALENT_VISIBILITY. Policy version `2026-10-23`. Grants append; revocations set `revokedAt`. |
| `/privacy/export` | GET | requireSession, requireRole('STUDENT') | Owner-scoped export includes profile, guardian consent, preferences, marks, applications (metadata), documents (metadata), expenses, budgets, money plan, reminders, clinic bookings (with reason), notifications, authored messages. Excludes ID numbers, hashes, sessions, other users' data. |
| `/privacy/account` | DELETE | requireSession | Any authenticated user can delete own account. `DeleteAccountSchema` requires `{ confirm: 'DELETE' }`. Deletes user (cascade) and removes uploaded files. Records `SecurityEvent`. |

Evidence: `apps/api/src/routes/privacy.ts`, `apps/api/tests/privacy-notifications.test.ts`.

### Notifications
| Route | Method | Guard | Notes |
|---|---|---|---|
| `/notifications` | GET | requireSession | Owner-scoped. `unread` query supported. Ordered by createdAt desc. |
| `/notifications/:id/read` | POST | requireSession | Ownership checked via `findFirst({ where: { id, userId } })`; returns 404 if not found or not owned. |
| `/notifications/read-all` | POST | requireSession | Owner-scoped `updateMany`. |

Evidence: `apps/api/src/routes/notifications.ts`, `apps/api/tests/privacy-notifications.test.ts`.

### Demo
| Route | Method | Guard | Notes |
|---|---|---|---|
| `/demo/run-nudges` | POST | requireSession | Guarded by `DEMO_MODE` inside the handler: returns 404 when `env.DEMO_MODE` is false. Nudges are owner-scoped. |

Evidence: `apps/api/src/routes/demo.ts`, `apps/api/tests/offers-demo-mode-off.test.ts` (pattern), verified via E2E (demo-off returns 404).

## Findings

### 1) Authorization and ownership
- All M5/M6 mutators require `requireSession` and `requireRole('STUDENT')` except `/notifications/*` which require session only (notifications are user-owned; role-agnostic is fine as long as owner-scoped). `/privacy/account` requires session (ownership by authenticated user). `/clinic/slots` is public by design (no learner data).
- Ownership checks use the authenticated user id as the first filter (e.g., delete expense by `id`+`userId`, booking cancel by `userId`, notification read by `userId`). Cross-user attempts return 404 rather than 403.
- **Pass.**

### 2) Input validation
- Shared Zod schemas validate all inputs: `ClinicBookingInputSchema` (reason enum), `ExpenseInputSchema`, `BudgetInputSchema`, `PaydayInputSchema`, `ConsentUpdateSchema`, `DeleteAccountSchema`. Validation errors return 400 via the shared error handler.
- **Pass.**

### 3) SQL injection
- Prisma-only usage; no raw SQL in M5/M6 routes. Verified by grep.
- **Pass.**

### 4) Secrets
- No secrets in new code. Amounts in cents (integers), no IDs/tokens logged.
- **Pass.**

### 5) Logging / PII
- Notifications bodies are short and non-sensitive (titles/bodies contain no ID numbers, emails, phones, document contents). Nudges constructed server-side. Logger redaction unchanged. Export excludes sensitive fields.
- **Pass.**

### 6) Headers / HTTPS
- Existing security headers unchanged. HTTPS deferred (documented).
- **Pass for headers.**

### 8) CSRF
- State-changing requests require Origin/Sec-Fetch-Site checks via `csrfOriginCheck` (global). SameSite=Lax on cookies.
- **Pass.**

### 9) Idempotency
- Expense create, budget create, clinic booking create use `idempotent()`. Duplicate requests replay cached responses or return 422 on key reuse with different body. Demo trigger not idempotent (not creating a resource with client-supplied key) but is POST and protected by session + DEMO_MODE.
- **Pass.**

### 10) Ownership details
- Clinic cancel returns 404 if not found/not owned; booking list is owner-scoped. Notifications: `findFirst({ id, userId })` then 404 if missing. Privacy export/delete are owner-scoped to `req.authUser!.id`. Demo nudges run for the authenticated user only.
- **Pass.**

### 11) PII boundaries
- AI prompts unchanged by M5/M6; no learner data added to AI context. Notifications contain generic nudges. Clinic reason is from a fixed enum (no free-text health details).
- **Pass.**

### 12) Demo mode
- `POST /api/demo/run-nudges` checks `env.DEMO_MODE`. When false returns 404. Tested by `offers-demo-mode-off.test.ts` pattern and E2E behavior. Default in production is false; `.env.example` has no `DEMO_MODE=true`.
- **Pass.**

## Tests run (evidence)
- API: `pnpm --filter @iskole/api test` — 18 files, 193 passed, 1 skipped.
- Shared: `pnpm --filter @iskole/shared test` — 7 files, 82 passed.
- E2E: `pnpm test:e2e` — 4/4 passed (auth, M4, M5/M6 golden path).
- Typecheck/lint: `pnpm typecheck` and `pnpm lint` pass.

## Gaps / notes
- Notifications table missing from earlier milestone lists in places but implemented and tested.
- Consent API does not return a `granted` boolean (returns grantedAt/revokedAt); UI handles this correctly.
- Some M7+ features remain API-only (documented as gap 11 in SECURITY.md).
