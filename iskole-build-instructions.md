# iskole: Build Instructions

Hackathon: FNB App of the Year 2026. Track: **Access to higher education**.
Build window: Fri 23 Oct 08:30 to Sun 25 Oct 17:00. Submission: **Mon 26 Oct 23:59** via Sonke.
Today is Tue 20 Oct, so you have three days to prepare. Use them for repo setup, seed data and skills before kickoff.

---

## 1. What iskole is

iskole (isiZulu for "school") is a web app that walks a young South African from "I don't know what to study" to "I'm accepted, funded and on track to graduate", in one multistep journey.

Audience: 16 to 35. This matters legally (see POPIA, section 7): under 18s need a competent person's consent.

### The journey (this is also your demo script and your user journey slide)

1. **Onboard**: create account, verify email, create profile and preferences.
2. **Discover**: AI matches the learner to schools and courses, or the learner searches a career field and gets matched schools and subjects.
3. **Qualify**: the app calculates the learner's APS (Admission Point Score) deterministically from their subject marks and shows which courses they qualify for.
4. **Fund**: compare funding options (NSFAS, bursaries, loans) with benefits, eligibility and deadlines.
5. **Apply**: easy apply uses stored profile data. Private bursaries require an acceptance letter; NSFAS is the exception.
6. **Accept**: offer letter arrives by email and is also viewable in the app.
7. **Succeed**: AI study plan, calendar export, wellness booking, cost planning with payday nudges.
8. **Connect**: communities by field across universities, chat, and opt-in visibility to companies.

---

## 2. Enhanced feature list

Your 26 meeting points are kept. Below they are grouped, tightened, and flagged as **CORE** (must work in the demo), **STRETCH** (build only if CORE is done), or **FAKE-IT** (seeded or simulated, and labelled honestly as such in the deck).

### A. Identity and profile (CORE)
- Account creation, email verification, login, password reset: **better-auth only** (section 5).
- Profile: name, province, grade or qualification status, subjects and marks, interests, preferences, language, data-budget preference.
- Preferences editable at any time (regions, fields, budget ceiling, study mode).
- SA ID number: collected only at the point of an application, encrypted at rest, checksum-validated, never sent to the AI.

### B. Discover and match (CORE, this is your Intelligence score)
- **APS calculator** (deterministic code, unit tested). The AI never does arithmetic.
- **Hybrid matching**: deterministic filter first (APS, required subjects, province, budget), then AI ranks and explains the shortlist in plain language. This stops hallucinated courses.
- **Career search**: user types a field ("data science", "nursing"), gets matching courses, required subjects, and institutions.
- **AI recommendations** based on profile, with a "why this match" explanation and a "what to improve" line (for example "raise Maths by 8% to qualify").
- Enhancement: **pathway fallbacks**. If the learner does not qualify, suggest bridging programmes, TVET routes or rewrites. This is high Impact.

### C. Funding and applications (CORE)
- Compare funding options side by side: benefits, eligibility, deadlines, what it covers.
- **Easy apply**: pre-fills from profile, user reviews, then submits.
- Rule engine: private bursary requires an uploaded or recorded acceptance letter; NSFAS does not.
- Offer letter: sent by email and stored in the app. Secure download via signed URL.
- **FAKE-IT**: there is no live NSFAS or university API. Build a clearly labelled "partner submission" adapter that writes to your own tables and sends the email. Say so in the deck. Judges prefer honest simulation over false claims.
- Application state machine: `DRAFT → SUBMITTED → UNDER_REVIEW → OFFER_ISSUED → ACCEPTED | DECLINED`. Every transition is validated server-side.
- **Idempotency** on every POST that creates or submits (header `Idempotency-Key`, stored with request hash and response, 24 hour TTL).

### D. Succeed at university (CORE: study plan; STRETCH: the rest)
- Study plan: user adds course codes and the modules they struggle with, AI asks when they are available, generates a weekly plan, user approves, then exports to calendar as an `.ics` file (no Google OAuth needed, far less attack surface and far less time).
- Wellness: book a session with the school's clinic (slot table per institution, seeded).
- Cost planning: expenses and budget items, with a payday date. A scheduled job nudges "remember you noted: textbooks, transport" on payday, with an AI-written summary.
- CV generator from the profile (export PDF).
- Enhancement: **dropout-risk signal** (Intelligence criterion). Simple, explainable rules plus AI: missed study sessions, budget overrun, no check-in for N days leads to a gentle nudge and a wellness suggestion. Frame it as support, never surveillance, and keep it visible to the user only.

### E. Community and employment (STRETCH, but "companies hunt candidates" is your Sustainability and revenue story)
- Communities per field across universities. Moderated, with a report button.
- Chat (1-to-1 and community). Use SSE or short polling rather than WebSockets unless time allows.
- **Report feature** for abusive users: reason, evidence message IDs, moderator queue, block, and mute. Reports and blocks are enforced server-side.
- Company talent search: companies see **only learners who opted in**, and only fields the learner chose to share (no ID, no contact details until the learner accepts a connection request). This is the POPIA-safe version of "hunting".

### Cut list (do not build)
Real NSFAS integration, payments, native app, Google Calendar OAuth, video chat, real-time presence, multi-language beyond isiZulu and English strings for the key screens.

---

## 3. Rubric mapping (7 criteria x 10 = 70 points)

| Criterion | What judges ask | What iskole shows | Proof in submission |
|---|---|---|---|
| **Product** | Complete, polished, works as expected, market need, traction | One complete multistep journey with seeded realistic data; a demo account | Demo account in deck, 90s video of the full journey, tests passing |
| **Creativity** | New approach to an old problem | Hybrid deterministic plus AI matching, payday nudges, pathway fallbacks | One slide: "What is new" |
| **Usability** | Clarity, simplicity, "what do I do next" | Persistent progress bar across the journey, one primary action per screen, low-data mode | Journey screenshots, accessibility check |
| **Sustainability** | Team, next level, path to revenue | Revenue: companies pay for talent search, institutions and bursary providers pay for promoted listings, free for learners | Lean Business Canvas, one revenue slide |
| **Impact** | Size and importance of the problem | Access gap, bursary navigation, dropout prevention; low-data and multilingual | Numbers on the problem slide (cite real sources, verify before use) |
| **Presentation** | Story, relevance | One learner story (a named persona) carried through deck and video | 10 slide deck, 90s video |
| **Intelligence** | Can the app think, forecast, predict | Match ranking with explanations, study plan generation, payday nudges, dropout-risk signal | Dedicated slide with an example input and output |

Make sure every AI feature has a visible "why" explanation. Judges reward intelligence that can be inspected.

---

## 4. Architecture

```
iskole/
  apps/
    web/        Next.js (App Router), TypeScript, .tsx components
    api/        Express + Node.js, TypeScript, Prisma
  packages/
    shared/     Zod schemas, shared types (.ts), constants
  .claude/skills/
    owasp-security/SKILL.md
    frontend-design/ (will be in the skills dir)
    testing/ (see section 8)
  docker-compose.yml   (postgres, mailpit)
  .env.example
```

- pnpm workspaces. All files `.ts` or `.tsx`, never `.js` or `.jsx`.
- **Same-origin proxy**: Next rewrites `/api/*` to the Express server. The browser then talks to one origin, so session cookies stay `HttpOnly`, `Secure`, `SameSite=Lax` without CORS gymnastics.
- Authoritative authorization lives in Express. Next middleware may do an optimistic redirect only; it is never the security boundary.
- Postgres via Prisma. Every query goes through a data-access layer that takes the authenticated user, so ownership is enforced in one place.
- AI via the Anthropic SDK from Express only (never from the browser). Responses are requested as structured JSON and validated with Zod before use.
- Email: Mailpit locally, a transactional provider in the deployed environment.
- Background jobs (payday nudges, reminders): `node-cron` or a DB-backed job table. Keep it simple.

### Suggested data model (Prisma)
`User` (better-auth managed), `Profile`, `Preference`, `SubjectMark`, `Institution`, `Course`, `CourseRequirement`, `FundingOption`, `Application`, `ApplicationEvent`, `Document`, `OfferLetter`, `StudyPlan`, `StudyBlock`, `ExpenseItem`, `Budget`, `NudgeSchedule`, `ClinicSlot`, `Booking`, `Community`, `Membership`, `Message`, `Report`, `Block`, `TalentVisibility`, `ConnectionRequest`, `Consent`, `IdempotencyKey`, `AuditLog`, `SecurityEvent`.

Run `npx @better-auth/cli generate` for the better-auth tables rather than hand-writing them, then merge into the Prisma schema.

### API surface (non-auth)
Auth endpoints are **not listed here on purpose**. They come from better-auth at `/api/auth/*` and nothing else is added.

```
GET/PUT   /api/profile
GET/PUT   /api/preferences
POST      /api/marks                     (idempotent)
GET       /api/aps
GET       /api/courses?field=&province=&q=
POST      /api/match                     (AI, rate limited)
GET       /api/funding
GET       /api/funding/compare?ids=
POST      /api/applications              (idempotent)
POST      /api/applications/:id/submit   (idempotent)
POST      /api/applications/:id/documents
GET       /api/offers/:id
POST      /api/study-plans               (AI, rate limited)
POST      /api/study-plans/:id/approve
GET       /api/study-plans/:id/calendar.ics
GET/POST  /api/expenses, /api/budgets
GET       /api/clinic/slots
POST      /api/clinic/bookings           (idempotent)
GET/POST  /api/communities, /api/messages
POST      /api/reports
GET/PUT   /api/privacy/talent-visibility
GET       /api/privacy/export            (POPIA data export)
DELETE    /api/privacy/account           (POPIA erasure request)
GET       /api/company/candidates        (role COMPANY, opt-in only)
```

---

## 5. Auth rules (better-auth)

The only auth surface is what better-auth ships. The agent must not invent `/register`, `/login`, `/refresh`, `/me`, `/forgot-password` or any custom token endpoint.

- Mount better-auth on Express with its Node handler at `/api/auth/*` **before** `express.json()`. Check the current better-auth Express docs for the exact route pattern for your Express version.
- Client side in Next: `createAuthClient` from better-auth, calling better-auth's own methods (`signUp.email`, `signIn.email`, `signOut`, `useSession`, `forgetPassword`/`resetPassword`, email verification). Confirm exact method names against current docs, since they change between versions.
- Roles (`STUDENT`, `COMPANY`, `MODERATOR`, `ADMIN`): use better-auth's own mechanism (admin plugin or `additionalFields`). Check docs before choosing. Never let a client set its own role at signup.
- Session in Express routes: `auth.api.getSession({ headers })` through a single `requireSession` middleware, then `requireRole(...)`.
- Email verification required before applying to anything. Password policy and breached-password check per the OWASP skill.
- Enable better-auth's built-in rate limiting and add stricter limits on auth routes.
- Company accounts require manual approval flag (`approved=false` by default) before they can see any candidate.

Tell the agent to read the live docs (https://www.better-auth.com/docs, and the `llms.txt` if available) before writing any auth code, and to state the doc page used in a code comment.

---

## 6. Security (priority one)

Install the OWASP skill at `.claude/skills/owasp-security/SKILL.md`. **Edit it first**, because it was written for another project:

1. Replace "Sekolo" with "iskole" in the title and description.
2. The "scoped Prisma client" tenant rule does not map to iskole. Replace with: *"Every data access is scoped by the authenticated user's id (ownership), and company access is limited to opted-in candidates."*
3. It references an `sa-id-validation` skill and an "instructions doc" with an `AuditLog` model. Neither is in this repo. Either add them, or add this line to the skill: *"ID numbers: validate the 13-digit format and Luhn checksum, encrypt with AES-256-GCM using a per-environment key from env, store only ciphertext plus IV and tag, never log."*
4. The Teacher/Registrar examples do not apply. Swap for `STUDENT` accessing only their own applications, and `COMPANY` accessing only opted-in candidates.

Extra rules specific to iskole, beyond the skill:

- **AI safety**: treat all user text sent to the model as untrusted (prompt injection). Never put ID numbers, full contact details or other learners' data into prompts. Validate model output with Zod. Rate limit AI routes per account. Cap prompt and response sizes. The model has no tools that write data.
- **Chat and communities**: server-side length limits, output escaping, report and block enforced in queries, moderator actions audit logged.
- **Documents**: acceptance letters and offer letters are served only via short-lived signed URLs after an ownership check.
- **Idempotency keys**: scoped per user, so one user cannot replay or read another's key.
- **Enumeration**: generic responses on login and reset, uniform response timing where practical.
- **Secrets**: `.env` in `.gitignore`, `.env.example` committed, secrets scanning in CI.
- **Dependencies**: `pnpm audit` in CI, pinned versions, lockfile committed.
- **Seed data**: never real learner data. Demo account credentials only exist in the demo environment.

Because "military priority" is the brief: add a `SECURITY.md` and a threat model table (asset, threat, control, test). It feeds directly into the **SSDLC form** you must submit, and it is a Presentation and Sustainability asset.

---

## 7. POPIA checklist (design requirements, not legal advice)

Have someone review with a qualified person before launch beyond the hackathon.

- Lawful basis and **explicit consent** records per purpose (profile, applications, talent visibility, marketing). Store in `Consent` with timestamp and policy version.
- **Under 18s**: POPIA treats children as needing a competent person's consent. Capture age at signup, and for 16 to 17 require guardian consent confirmation before enabling applications and any talent visibility. Company visibility is **disabled** for under 18s.
- Data minimisation: collect ID number only when an application needs it.
- Data subject rights: export (`/api/privacy/export`) and deletion request (`/api/privacy/account`) both working in the demo.
- Retention: define and state it (for example delete drafts after 12 months of inactivity).
- Privacy notice page, named Information Officer placeholder, breach response steps in `SECURITY.md`.
- Operator agreements and cross-border transfer note for the AI and email providers.
- Medical or wellness data (clinic bookings) is special personal information. Store the minimum (slot and clinic, no free-text health detail).

---

## 8. Testing

Use whichever testing skill is in your skills dir. If none, this is the baseline.

- **Unit (Vitest)**: APS calculator, ID checksum, application state machine, idempotency logic, budget and payday scheduling, Zod schemas.
- **API (Vitest + supertest against a test Postgres)**: for every route, test (a) unauthenticated is 401, (b) wrong role is 403, (c) another user's resource is 403 or 404, (d) invalid body is 400, (e) happy path.
- **Security tests**: IDOR across two seeded users, rate limit hit, CSRF on state-changing routes, idempotent replay returns the same response, company cannot see non-opted-in learners, under-18 never appears in talent search.
- **AI tests**: mock the model. Test that malformed output is rejected, and that prompts contain no ID number or contact data.
- **E2E (Playwright)**: the golden path (signup, profile, match, funding compare, apply, offer, study plan). This doubles as your demo rehearsal.
- CI runs lint, typecheck, tests and `pnpm audit` on every push.

Definition of done for any route: the "Quick self-check" list at the bottom of the OWASP skill, plus its tests.

---

## 9. Frontend direction

Use the frontend-design skill. Design intent, kept deliberately specific:

- **Warm, restrained light mode.** Off-white paper background, one deep accent, one warm secondary, generous whitespace. No purple-to-blue gradients, no glassmorphism, no glowing cards, no generic dark dashboard, no emoji as icons.
- Typography with character: a distinctive display face for headings paired with a highly legible body face. Define tokens once (colour, type scale, spacing, radius).
- Components feel like paperwork made kind: clear steps, visible progress, plain language, one primary button per screen.
- Mobile first (most of the audience is on a phone), low-data friendly: small images, no heavy client bundles, skeleton states, works on slow connections.
- Accessibility: WCAG AA contrast, keyboard navigable, labelled inputs, focus states.
- isiZulu and English strings through a simple i18n layer for the key screens only.

---

## 10. Time plan

| When | Goal |
|---|---|
| **Tue 20 to Thu 22 Oct (prep)** | Repo, docker-compose, better-auth wired, CI, skills installed and edited, seed data (about 10 institutions, 40 courses with APS and subject requirements, 6 funding options), design tokens, Anthropic key |
| **Fri 23 Oct** | Auth, profile, APS, discovery and match, funding compare. Kickoff at 10:00, post your workspace on socials |
| **Sat 24 Oct** | Applications and offer letters, study plan, cost planning. **War room 14:00 to 17:00**, have a working demo ready for it |
| **Sun 25 Oct** | Stretch features, hardening, E2E, seed demo account. Hackathon ends 17:00 with no mentor support after |
| **Mon 26 Oct** | Record 90s video, finish deck (max 10 slides, PDF), SSDLC, Lean Business Canvas, submit **well before 23:59** |

Seed data accuracy: real APS requirements and bursary criteria change yearly. Take them from official institution pages and mark the data "sample, verify before use" in the app footer.

---

## 11. Submission checklist (from the briefing)

- [ ] Team profiled on Sonke (one person only), even if working solo
- [ ] Deck, PDF preferred, **max 10 slides**: features and screenshots, **demo account for judges**, security, user journey story, technical architecture
- [ ] Demo video **max 90 seconds**, link placed on the slides
- [ ] SSDLC form filled in
- [ ] Lean Business Canvas filled in
- [ ] App qualifies as a web app that receives and processes data in real time (it does: it is not a static site)
- [ ] Submitted through Sonke by **Mon 26 Oct 23:59**

Suggested 10 slide outline: 1 Persona and problem, 2 Solution and journey, 3 Product screenshots, 4 Intelligence (input and output example), 5 Security and POPIA, 6 Architecture, 7 Usability and accessibility, 8 Impact numbers, 9 Business model and next steps, 10 Demo account and links.

---

## 12. Open questions for the team

1. Which institutions and bursaries are in the seed data, and who owns verifying them?
2. Who is the Information Officer placeholder and who reviews the POPIA section?
3. Is the company talent search CORE or STRETCH? It is your strongest revenue story but also your biggest privacy risk.
4. Who owns the deck and video so they are not left to Monday evening?
