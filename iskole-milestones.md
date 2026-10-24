# iskole: Milestone Plan v2 (dashboard redesign and feature completion)

Written Fri 23 Oct 2026, 07:30. Build window ends **Sun 25 Oct 17:00**. Submission **Mon 26 Oct 23:59**.
Basis: a read of `Katleho-codes/iskole` (commit "iskole first draft") against `iskole-build-instructions.md`. Nothing was run, so every "missing" item below is from reading code.

Read this first: the full list is more than 56 working hours of work for a small team. Section 2 sets **cut lines** so you always have a demoable product. Do the milestones in order and stop adding when a cut line is reached.

---

## 1. Where the repo stands

| Area | State |
|---|---|
| API, security, tests | Strong. CSRF, idempotency, signed document URLs, ID encryption, guardian consent, rate limits, audit and security events all exist with tests |
| Screens | Sign in, sign up, reset, verify, profile, marks, match, funding, applications, study plan, guardian consent |
| Screens missing | Expenses and budgets, clinic, communities and chat, privacy (export and delete), company talent search, offer letters, calendar, notifications |
| Features missing | Offer issuing and accept or decline, offer email, payday nudge job, CV generator, dropout-risk signal, block and mute, moderator queue, live chat updates |
| Repo hygiene | No CI, no testing skill file, email verification switched off, stray `schema.prisma.clean` and `schema.prisma.garbage`, English-only strings, 8 seed courses, no architecture diagram or demo script |
| Look and feel | Single-column pages, pine green and ochre on paper, Fraunces and Public Sans, no shell or navigation |

---

## 2. Order of work and cut lines

| # | Milestone | Rough time | Cut line |
|---|---|---|---|
| M0 | Foundations and cleanup | 1.5 h | Must have |
| M1 | Design system and app shell | 5 h | Must have |
| M2 | Core journey in the shell | 7 h | Must have |
| M3 | Offer lifecycle | 4 h | Must have |
| M4 | Study plan and real calendar | 6 h | Must have |
| **Cut line A: end of Fri night. M0 to M4 done means a complete, honest journey.** | | | |
| M5 | Money, nudges and wellness | 6 h | Strongly wanted |
| M6 | Privacy centre and notifications | 3 h | Strongly wanted (POPIA proof) |
| **Cut line B: end of Sat. Everything a judge scores is visible.** | | | |
| M7 | Community, chat and moderation | 6 h | Stretch |
| M8 | Company talent search and CV | 5 h | Stretch |
| M9 | Intelligence: dropout-risk signal | 3 h | Stretch (high Intelligence score, low cost) |
| M10 | Hardening, E2E, submission pack | 6 h, **starts no later than Sun 12:00** | Must have |

If you are behind at Cut line B, drop M7 chat and keep only the report button, then drop M8 company search before dropping M6 or M10.

Suggested lanes if you are two or more people: **Lane A (backend)** M0, M3 API, M5 API, M7 API, M8 API, M9. **Lane B (frontend)** M1, M2, M4, then every screen. Agree the API shapes in `packages/shared` first so both lanes can work at once.

---

## 3. Design direction (applies to every milestone)

### 3.1 The brief
iskole is a **student's personal dashboard**: the place a learner opens daily to see "what is next for me". It is a working tool, not a marketing site. Calm, clear, a little confident. It must not look like a default AI or SaaS template.

### 3.2 Colour (new, replaces pine green, ochre and cream)
Light mode only. A cool, clean base lets the single accent carry personality, and keeps clear of the cream and terracotta look the frontend-design skill warns about.

| Token | Hex | Use |
|---|---|---|
| `--background` | `#F3F5F9` | App canvas (cool mist) |
| `--surface` | `#FFFFFF` | Cards, sidebar, dialogs |
| `--ink` | `#16203A` | Text, sidebar active, primary buttons (deep navy) |
| `--ink-muted` | `#5A6480` | Secondary text |
| `--line` | `#E0E5EF` | Borders and dividers |
| `--accent` | `#C42B5B` | Protea rose: primary action highlight, progress, active calendar day |
| `--accent-soft` | `#FBE7EE` | Accent tint backgrounds |
| `--sky` | `#2F6FB5` | Calendar study blocks, links, info |
| `--sky-soft` | `#E4EEF9` | Info tint |
| `--leaf` | `#1F8A5B` | Success, accepted, funded |
| `--amber` | `#B7791F` | Warning, deadlines (text on `#FFF3D6`) |
| `--danger` | `#B3261E` | Errors, destructive |

Rules: navy does the structure, rose is used on at most one thing per screen (the main action or the current progress), semantic colours are only for status. No gradients, no glass, no glow, no coloured shadows. **Verify every text and background pair for WCAG AA with a contrast checker** before merging. These hexes are a starting point and rose on tinted backgrounds is the pair most likely to need adjusting.

Calendar event colours come from the course or module, taken from a fixed 6 colour palette that all pass AA on white (derive them from `--sky`, `--leaf`, `--accent`, `--amber`, navy and a plum). Always pair colour with text or an icon so colour is never the only signal.

### 3.3 Typography
- **Headings: Montserrat** (weights 600 and 700, tight tracking on large sizes, `-0.01em`).
- **Body and UI: Cabin** (400, 500, 600).
- Load both with `next/font/google` (`Montserrat`, `Cabin`), keeping the existing `--font-display` and `--font-body` variables so nothing else changes. Remove Fraunces and Public Sans.
- Scale (px): 12 caption, 14 UI and table text, 16 body, 18 lead, 22 section heading, 28 page title, 40 greeting. Line height 1.5 body, 1.2 headings. Keep text lines under 75 characters.
- Numbers in tables and budgets use `font-variant-numeric: tabular-nums`.
- Avoid ALL CAPS labels, avoid single-word accents in headings, avoid a tiny label above every heading.

### 3.4 Shape and surface
- Radius scale: 6 px inputs and chips, 10 px cards, 14 px dialogs and sheets. Not one radius for everything.
- Cards use a 1 px `--line` border and **no shadow** by default. Shadow only on floating layers (popover, dialog, toast).
- Density: 8 px grid, page gutter 24 px desktop and 16 px mobile.

### 3.5 shadcn/ui, redesigned
- Initialise shadcn for Tailwind v4 and React 19 (`pnpm dlx shadcn@latest init`), and read the current docs first because the CLI flags change. Components land in `apps/web/src/components/ui/*.tsx`. All files `.tsx`.
- Map shadcn's CSS variables (`--background`, `--foreground`, `--primary`, `--ring` and so on) to the tokens in 3.2 inside `globals.css`. Do not leave the default neutral/zinc theme anywhere.
- Restyle, do not just recolour:
  - **Button:** primary is navy, one `accent` variant (rose) for the single main action per screen, ghost and outline for the rest. 40 px height, 10 px radius, a 2 px focus ring in `--sky`.
  - **Input, Select, Textarea:** 44 px tall for touch, visible label always above (never placeholder-only), inline error text under the field.
  - **Card:** border, no shadow, title in Montserrat 600.
  - **Badge:** semantic variants (`leaf`, `amber`, `sky`, `danger`, `neutral`) for statuses.
  - **Progress, Tabs, Table, Dialog, Sheet, Tooltip, Skeleton, Toast (Sonner), Calendar, Popover, Command, Avatar, Separator, Dropdown Menu, Form, Checkbox, Switch, Accordion:** all styled from tokens.
- Icons: `lucide-react`, one stroke width (1.75), no emoji.
- Add a `/design` route (dev only) that shows every component and state, so reviewers can check the system in one place.

### 3.6 Motion
Few, purposeful, quick (120 to 240 ms, `ease-out`). Use `tw-animate-css` (shadcn's default) and CSS transitions. Add the `motion` library only for the two things that need it (list reordering and the calendar view switch).
- Page content: a single 160 ms fade on route change. No slide-up on every section.
- Sidebar: active indicator slides between items.
- Progress: ring and bar values animate from the previous value to the new one.
- Success moments (application submitted, offer accepted): one short check-draw animation and a toast. Nothing else celebrates.
- Skeletons for loading, shimmer limited to 1.2 s loops, off under `prefers-reduced-motion`.
- Respect `prefers-reduced-motion` everywhere (keep the existing global rule).

### 3.7 Empty, loading and error states (the checklist)
I could not read `checklist.design/web-app` (the page returned only its metadata, so its content is rendered client-side). The list below follows the usual web app checklist categories instead. **If you paste the checklist text, I will map each item to a milestone.**

Every screen must define five states and have a test or screenshot for each: **empty, loading, error, partial or populated, and offline or slow**.

- **Empty state anatomy:** a small custom illustration, one plain sentence on what this place is for, one sentence on what to do, **one** primary action. Never "No data".
- **Illustrations:** draw one consistent set of about 10 original inline SVGs (navy line, one rose or sky fill, 2 px stroke) in `components/illustrations/*.tsx`. Do not use stock packs. Keep each under 3 KB so low-data users are not penalised.
- **Loading:** skeletons that match the final layout. Buttons show a spinner and keep their width. Never block the whole page for one failing card.
- **Errors:** say what happened and what to do, with a retry. Field errors inline and focus moves to the first invalid field. Server errors never show stack traces.
- **Forms:** labels above, helper text, required marks, autosave drafts for long forms (application), confirm before leaving with unsaved changes, disabled submit only while pending.
- **Navigation:** current page is marked with `aria-current`, breadcrumbs on deep pages, back behaviour works, links look like links.
- **Feedback:** every action confirms with a toast or inline change, destructive actions need a confirm dialog that names the thing being deleted.
- **Accessibility:** WCAG AA contrast, full keyboard use, visible focus, 44 px touch targets, labelled icons, `aria-live` for toasts, headings in order, calendar usable without a mouse.
- **Responsive:** designed mobile first at 360 px, sidebar becomes a bottom bar on mobile.
- **Low data:** no hero images, fonts `display: swap` with 2 families only, pages under about 150 KB of JS where possible.

Empty state copy (use these as the starting point):

| Screen | Heading | Body | Action |
|---|---|---|---|
| Dashboard, no profile | Let's set up your starting point | Tell us a bit about you and we will show courses you can aim for. | Create your profile |
| Marks | No marks yet | Add your subjects and percentages to see which courses you qualify for. | Add marks |
| Match, no marks | We need your marks first | Matches are based on your APS, so add your results to unlock them. | Add marks |
| Match, no results | Nothing fits right now | Try widening your provinces or fields, or look at bridging routes. | Edit preferences |
| Funding, no saved | Nothing saved yet | Save options you like and compare them side by side. | Browse funding |
| Applications | No applications yet | When you find a course and funding you like, apply in one place. | Find a course |
| Offers | No offers yet | Offers from institutions will appear here and in your email. | View applications |
| Study plan | No study plan yet | Tell us your modules and when you are free and we will build a weekly plan. | Create plan |
| Calendar | A clear week | Nothing is scheduled. Add a study plan to fill it in. | Create plan |
| Expenses | Nothing tracked yet | Add what you spend and we will remind you on payday. | Add expense |
| Clinic | No sessions booked | Book a visit with your campus clinic when you need support. | Book a session |
| Communities | Find your people | Join a community for your field across universities. | Browse communities |
| Notifications | You are all caught up | Reminders and updates will show up here. | none |

---

## 4. Application shell and navigation (built in M1, used by every milestone)

### 4.1 Route structure
Use an App Router **route group** with a shared layout so the sidebar stays mounted and only the main area changes.

```
apps/web/src/app/
  (public)/            landing, signin, signup, reset-password, verify-email
  (app)/
    layout.tsx         shell: sidebar, top bar, <main>{children}</main>
    loading.tsx        shell-level skeleton
    dashboard/page.tsx     "Home"
    profile/page.tsx
    marks/page.tsx
    match/page.tsx
    funding/page.tsx
    applications/page.tsx
    applications/[id]/page.tsx
    offers/page.tsx
    study-plan/page.tsx
    calendar/page.tsx
    money/page.tsx          expenses and budgets
    wellness/page.tsx       clinic bookings
    communities/page.tsx
    communities/[id]/page.tsx
    messages/page.tsx
    cv/page.tsx
    privacy/page.tsx
    notifications/page.tsx
    company/page.tsx        role COMPANY only
    moderation/page.tsx     role MODERATOR or ADMIN only
```
Clicking a sidebar link navigates with `next/link`, the sidebar does not remount, and the clicked page renders in the main area. Each page has its own `loading.tsx` and `error.tsx`.

### 4.2 Sidebar groups and links
Group by the journey, so the sidebar teaches the product. Icons from lucide, labels in sentence case.

| Group | Links |
|---|---|
| (top) | Home |
| Plan | Profile, Marks, Match |
| Fund and apply | Funding, Applications, Offers |
| Study | Study plan, Calendar, Money, Wellness |
| Connect | Communities, Messages |
| Tools | CV |
| (bottom) | Notifications (with unread count), Privacy, Account menu (avatar, language, sign out) |

Role extras appear only for the role: **Company** for COMPANY, **Moderation** for MODERATOR and ADMIN. Hiding a link is cosmetic. Every route is still authorised on the server (see M10).

Behaviour: desktop 248 px expanded and 72 px collapsed (icons with tooltips, state saved in `localStorage` inside try/catch). Tablet collapses by default. Mobile uses a bottom bar with Home, Plan, Apply, Study, More (a Sheet with the rest). Keyboard: `g` then `h` style shortcuts are optional, skip them if time is short. A "skip to content" link comes first.

### 4.3 Top bar
Page title and breadcrumb, a command palette (`Ctrl or Cmd + K`, shadcn Command, jumps to any page and quick actions such as "Add expense"), notifications bell, language switch (English and isiZulu), account menu.

### 4.4 Session handling
The shell layout is a server component that loads the session once (reuse the `getSession` approach from the current dashboard page) and redirects to `/signin` if there is none. This is a convenience redirect only. Every API route keeps its own `requireSession` and `requireRole`. Pass the user and role to a client `SessionProvider` for the sidebar.

---

## M0. Foundations and cleanup (1.5 h)

Goal: a clean, safe base before any redesign.

- [ ] Delete `apps/api/prisma/schema.prisma.clean` and `schema.prisma.garbage`.
- [ ] Add `.github/workflows/ci.yml`: install with pnpm, `lint`, `typecheck`, API tests against a Postgres service container, shared tests, `pnpm audit --audit-level=high`, and a secrets scan (gitleaks). Use an ephemeral database, which also closes SECURITY gap 4. Update gap 3 in `SECURITY.md`.
- [ ] Decide on `lodash` advisory (gap 7): pin or override, record the decision.
- [ ] Turn **email verification back on** (`REQUIRE_EMAIL_VERIFICATION = true`), confirm Mailpit receives the link, and run the whole golden path test with verification on. For the demo, seed a pre-verified demo account instead of turning the control off. Update gap 8.
- [ ] Add the **testing skill** to `skills/testing/SKILL.md` (or confirm the path of the one you have) so the agent prompt has something to load.
- [ ] Add `docs/architecture.md` with a diagram (Mermaid is fine) and a one page `docs/demo-script.md` for the 90 second video.
- [ ] Expand seed data to about 10 institutions, 40 courses (with APS and subject requirements) and 6 funding options. Keep every description labelled sample.

Acceptance: CI is green on a clean clone, the golden path passes with verification on, no stray files.

---

## M1. Design system and app shell (5 h)

Goal: the dashboard frame and the full component kit, so every later page is assembly.

Tasks
- [ ] Install shadcn and the dependencies in 3.5. Configure fonts (Montserrat and Cabin) and replace the tokens in `globals.css` with section 3.2.
- [ ] Style the components listed in 3.5, then build `/design` (dev only) showing each with all states.
- [ ] Build the `(app)` route group, shell layout, sidebar (4.2), top bar (4.3), mobile bottom bar and Sheet.
- [ ] Build shared page parts: `PageHeader`, `Section`, `StatCard`, `StatusBadge`, `EmptyState`, `ErrorState`, `SkeletonList`, `ConfirmDialog`, `FormField`.
- [ ] Build the illustration set (3.7) and wire `EmptyState` to accept one.
- [ ] Add toasts (Sonner) styled to the theme.
- [ ] Move existing pages into `(app)` without changing their logic, so everything still works inside the shell.
- [ ] English and isiZulu strings for the shell, sidebar and empty states (a real translator should review the isiZulu).

Acceptance
- Clicking each sidebar link shows that page in the main area with no full page reload and no sidebar flicker.
- Keyboard only: Tab reaches skip link, sidebar, top bar, content in a sensible order.
- Lighthouse accessibility score of 95 or more on `/design` and Home.
- No remaining use of the old palette (`grep` for the old hex values and `ink`/`ochre` utility names).

Rubric: Usability, Presentation, Product.

---

## M2. Core journey in the shell (7 h)

Goal: the CORE journey, redesigned as a personal dashboard.

### Home (dashboard)
- **Journey tracker:** horizontal stepper (Profile, Marks, Match, Funding, Apply, Offer, Study) with real completion state from the API, one clear "Next step" card with a single rose button. This is the one memorable element.
- **Today** card: today's study blocks and anything due.
- **Deadlines** card: bursary and application deadlines, soonest first.
- **Applications** summary with status badges, **Money** mini summary, **Notifications** preview.
- Greeting uses the first name only. Empty state when the profile is not started.
- Add `GET /api/dashboard` (read only, aggregates the learner's own data in one request, 401 and ownership tested) so Home loads in one round trip.

### Profile, Marks, Match, Funding, Applications
- **Profile:** two column form with sections (About you, Where and how, Interests, Budget), autosave draft, preferences editable and visible, age and guardian status shown clearly.
- **Marks:** editable table with live APS in a sticky summary, validation per row.
- **Match:** result cards with a match strength meter, "why this match" and "what to improve" text, a filter bar (field, province, budget), a career search box ("data science", "nursing"), and a **pathway fallback** section (bridging, TVET, rewrite) when nothing qualifies. Add `GET /api/courses?field=` coverage and make sure the search path is tested.
- **Funding:** card grid with save, a **compare tray** (select up to 3, side by side table on desktop, stacked on mobile), benefits and eligibility as plain lists, deadline badges. Confirm `GET /api/funding/compare?ids=` exists, or build it from the existing funding route.
- **Applications:** list with status badges, detail page `applications/[id]` with a **timeline** of `ApplicationEvent`s, documents panel (upload with progress, signed download), and the **easy apply** flow as a stepper: Review details (pre-filled), Choose funding, Documents (acceptance letter required for private bursaries, not for NSFAS), Confirm, Submitted. Autosave the draft. Enforce the rule on the server and show the reason in the UI.

### Backend additions in this milestone
- `GET /api/dashboard`.
- Tests for each new route: 401, 403, someone else's resource, 400, happy path, and idempotent replay for POSTs.

Acceptance: a fresh demo account can go Profile to Submitted entirely through the new UI. Every screen has all five states. All journey API tests still pass.

Rubric: Product, Usability, Intelligence (match explanations), Creativity (pathway fallbacks).

---

## M3. Offer lifecycle (4 h)

Goal: close the biggest hole in the journey. The "Accept" step.

The schema already has `OfferLetter` (`filename`, `key`, `sentAt`) and `GET /offers/:id` returns it to the owner. There is no way to create one, no email, and no response.

Backend
- [ ] Extend the application status flow beyond `SUBMITTED`: `UNDER_REVIEW`, `OFFER_ISSUED`, `ACCEPTED`, `DECLINED` (add to the enum or status type in the schema and shared Zod, with a migration). Put the allowed transitions in one place in `packages/shared` and unit test every legal and illegal transition.
- [ ] `POST /api/admin/applications/:id/offer` (role MODERATOR or ADMIN, idempotent): create a generated offer letter PDF (simple, labelled "SAMPLE offer, not a real institution decision"), store it through `lib/storage.ts`, create the `OfferLetter`, move status to `OFFER_ISSUED`, write an `ApplicationEvent` and an `AuditLog`, **send the offer email** via `lib/email.ts` (no PII in logs).
- [ ] **Demo simulation:** `POST /api/applications/:id/simulate-review` available only when `DEMO_MODE=true`, which moves `SUBMITTED` to `UNDER_REVIEW` and issues the offer after a short delay, so the demo does not need a second login. The UI labels this "Simulated institution response". Never enabled in production config.
- [ ] `POST /api/offers/:id/respond` with `{ decision: 'ACCEPT' | 'DECLINE' }` (STUDENT, owner only, idempotent). Accepting a private bursary offer still needs the acceptance letter on file, so the server enforces it.
- [ ] Offer PDF download through the same signed URL pattern as documents.

Frontend
- `offers` page: list of offers, offer detail with the letter preview or download, Accept and Decline with a confirm dialog that states the consequence, and a success moment.
- Application timeline shows the offer events. Notification created when an offer arrives (see M6).

Tests: state machine unit tests, role tests for the admin route, ownership on respond, replay returns the same response, a company or other learner cannot read an offer.

Acceptance: submit, then simulated review, then email in Mailpit and in-app offer, then accept, all in the demo without touching the database.

Rubric: Product, Impact, Presentation. Update `SECURITY.md` gap 10.

---

## M4. Study plan and a real calendar (6 h)

Goal: study plan blocks shown on an actual calendar, with a guided creation flow.

Data facts: `StudyPlan.blocks` is a `Json` column. Before building, read `study-plans.ts` and `packages/shared` to confirm the block shape, then define a Zod `StudyBlock` schema (`id`, `title`, `moduleCode`, `start`, `end` as ISO strings with timezone, `kind`, `notes`) and validate on write and on read. Store times as UTC and render in `Africa/Johannesburg`, and test daylight handling by using a fixed zone.

Study plan creation (stepper)
1. **Modules:** add course codes and the modules they struggle with (course code is required, validate its format) plus a difficulty slider.
2. **Availability:** weekly availability grid (days by hour bands) with presets, because the AI "asks when you are available".
3. **Generate:** AI builds the plan from modules, difficulty, exam dates and availability, returns structured JSON validated by Zod, with a one line reason per block. Deterministic fallback if the AI fails. Respect the existing AI guard and rate limits.
4. **Review and approve:** shows the plan on the calendar preview. The learner can drag to move or resize a block, delete, or add a block before approving.
5. **Add to calendar:** approving enables `.ics` export (the existing route) and the in-app calendar.

Calendar page (`/calendar`)
- **Views:** Month, Week (default on desktop), Day (default on mobile), and an Agenda list (the accessible, low-data view).
- **Build it yourself** from `date-fns` and CSS grid rather than adding a heavy full calendar library, because it keeps the bundle small and lets the design match the theme. Use shadcn `Calendar` (react-day-picker) as the small month picker in the side panel.
- Time grid with a "now" line, all-day row for deadlines (bursary and application deadlines, exam dates), study blocks coloured by module, click a block for a popover with details and Edit, Mark done, Skip, drag to move and resize in the week view, keyboard alternatives for every drag action (arrow keys move, a dialog edits times).
- Overlap handling (side by side), "Today" button, previous and next, view switcher with the 200 ms transition.
- Progress: blocks marked done feed a weekly "study consistency" stat on Home and into M9.
- Empty state: "A clear week".
- Accessibility: `role="grid"`, labelled cells, focus management, announcements for moves, and the Agenda view as the screen reader friendly alternative.

Backend additions
- `PATCH /api/study-plans/:id/blocks/:blockId` (owner only, Zod validated, idempotent where it creates) for edit, move, mark done, skip.
- `GET /api/calendar?from=&to=` merges study blocks, deadlines and bookings into one read for the window, owner scoped.
- Tests: ownership, invalid time ranges (end before start), overlapping rules, `.ics` output contains the approved blocks and valid line endings.

Acceptance: create a plan, approve it, see every block on the week and month view, move one block by drag and by keyboard, mark one done, and download an `.ics` file that opens in a calendar app.

Rubric: Intelligence, Product, Usability, Creativity.

**Cut line A is here.**

---

## M5. Money, nudges and wellness (6 h)

### Money (`/money`)
- Expenses list and add form, budget per category with a progress bar (green under, amber near, red over), monthly summary chart. Draw the chart in SVG (keep it simple, accessible, with a table alternative), colours from the tokens.
- **Payday:** the schema has no payday field. Add `paydayDay` (1 to 31, with "last day of month") to a new `MoneyPlan` model or to `Budget`, with a migration, a Zod schema, and a test for months with fewer days.
- Notes to remember: expenses can be flagged "remind me", and the nudge lists them.

### Payday nudge job
- Add a `Notification` model (`userId`, `type`, `title`, `body`, `readAt`, `createdAt`, `dedupeKey`) and a `NudgeSchedule` if you need one. Keep notification bodies free of sensitive detail.
- Job runner: `node-cron` (or a DB-backed table polled by a single `setInterval`) started in `server.ts`. Each run is idempotent through `dedupeKey` so a restart never double-sends. Log ids only.
- The nudge text: AI writes a short friendly summary from **amounts and categories only, no names or contact details**, validated by Zod, with a plain template as the fallback. A small API endpoint `POST /api/demo/run-nudges` (only when `DEMO_MODE=true`) lets you trigger it live in the demo.
- Also create notifications for: offer issued, study block starting soon, bursary deadline within 7 days, report outcome.

### Wellness (`/wellness`)
- Pick a clinic, see available slots (existing capacity check), book with a reason from a fixed list (no free text health detail, per the POPIA notes), see upcoming and past bookings, cancel. Shows on the calendar.
- Add `DELETE /api/clinic/bookings/:id` (owner only) if missing.
- Copy tone: warm and private. State what is stored.

Tests: payday date edge cases, nudge dedupe, job does not run for deleted users, booking capacity race (two requests, one slot), ownership on cancel.

Rubric: Intelligence, Creativity, Impact.

---

## M6. Privacy centre and notifications (3 h)

Goal: visible POPIA proof, which also makes the Security slide easy.

- `/privacy`: plain language summary of what iskole holds, **Download my data** (existing export), **Delete my account** (confirm dialog with typed confirmation, existing delete), consent history with versions and dates, guardian consent status for under-18s, **Talent visibility** switch (disabled and explained for under-18s), AI use notice (what is sent and what is not).
- Add a `Consent` record write for each purpose with policy version if it does not exist yet, and a `GET /api/privacy/consents`.
- `/notifications`: list, mark read, mark all read, unread count in the sidebar. Endpoints `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`, all owner scoped.
- Static pages: Privacy notice, Terms, an Information Officer placeholder, and a short "How iskole uses AI" page.

Tests: export contains no ID ciphertext or password material, delete removes files and rows, notifications are never readable across users.

**Cut line B is here.**

---

## M7. Communities, chat and moderation (6 h, stretch)

Current state: community list, message list and post, and a report endpoint exist. Missing: block, mute, a moderator queue, 1 to 1 chat, live updates, UI.

Backend
- Models: `Block` (blockerId, blockedId, unique pair), `Mute` or a flag on `Membership`, `Conversation` and `ConversationMember` for 1 to 1 chat (or reuse `Message` with a nullable `conversationId`, decide after reading the schema), report `evidence` message ids and a moderator `resolution`.
- `POST /api/blocks`, `DELETE /api/blocks/:userId`, `GET /api/blocks`. **Block is enforced in every message and conversation query**, not just hidden in the UI.
- Reports: `evidence` ids must belong to the reported user and be visible to the reporter. Moderator endpoints `GET /api/moderation/reports`, `POST /api/moderation/reports/:id/resolve` (`DISMISS`, `WARN`, `REMOVE_MESSAGE`, `SUSPEND`), role MODERATOR or ADMIN, every action written to `AuditLog`.
- Live updates with **SSE** (`GET /api/messages/stream`) or 5 second polling. Start with polling and upgrade only if time remains. Rate limit message posting, cap length, escape on render.
- Under-18 safeguards: 1 to 1 messages from or to adults are not allowed for under-18 accounts. Communities are field based and moderated. State this in the UI.

Frontend
- Communities browse and join, community room with message list and composer, 1 to 1 messages, per message menu (Report, Block), report dialog with reason and the selected message as evidence, `moderation` queue page for moderators.
- Empty states for no communities joined, no messages, empty queue.

Tests: blocked users never see each other's messages, report evidence validation, moderator only routes, under-18 restrictions, rate limit, XSS payload in a message renders as text.

Rubric: Impact (safety), Product.

---

## M8. Company talent search and CV (5 h, stretch)

Company side (`/company`)
- Company sees only learners who **opted in**, are **18 or over**, and only the fields the learner chose to share. No email, phone or ID. Filters by field, province, APS band.
- **Connection request:** company sends a request with a message, the learner accepts or declines in their notifications. Only after acceptance is the chosen contact method shared. New `ConnectionRequest` model, idempotent create, rate limited per company, audit logged.
- Company accounts remain `approved=false` until a moderator approves. Add the moderator approval screen into `moderation`.
- Empty states for no approved company, no matches, no requests.

Learner side
- Talent visibility controls in `/privacy` (M6), a "who viewed" count is not shown (avoid surveillance feel), connection requests appear in notifications.

CV generator (`/cv`)
- Builds from profile, marks, education, interests and applications. Template picker (2 templates), live preview, **export to PDF**, option to attach to a company connection.
- Generate with a server side PDF library or print stylesheet, the choice is free but keep it dependency light. Never include the ID number. Test that the CV contains no ID.

Tests: under-18 never appears, non opted-in never appears, no contact fields in the payload, request needs an approved company, learner can only answer their own requests.

Rubric: Sustainability (revenue story), Impact, Product.

---

## M9. Intelligence: dropout-risk signal (3 h, stretch)

Goal: the clearest "the app thinks" moment for the Intelligence score, built with care so it supports and never surveils.

- A deterministic scoring function in `packages/shared` (unit tested) using only the learner's own data: missed study blocks in the last 14 days, budget overspend in the last month, days since last check-in, and an unanswered wellness prompt. Output is a level (`ok`, `watch`, `needs-support`) and the **reasons**, in plain language.
- AI only phrases the supportive message, from the level and reasons, never decides the level. Validated output, fallback template.
- Shown **only to the learner** on Home as a gentle card ("A bit behind this week? Here are two small steps") with actions: adjust study plan, book a wellness session, talk to a community. Never visible to companies or moderators, never used for any other purpose. Say so on the card and in the privacy notice.
- Dismissible, with "don't show this again" respected.

Tests: scoring edge cases, no cross-user reads, AI prompt contains no names or contact data.

Rubric: Intelligence, Impact.

---

## M10. Hardening, E2E and submission pack (6 h, start by Sun 12:00)

Security pass (priority one)
- [ ] Run the OWASP skill self-check for **every new route** and write the results into `docs/owasp-self-check-v2.md` (same format as the existing files).
- [ ] **Role and ownership matrix test:** one table driven test that calls every route as anonymous, student, other student, company, moderator and admin, and asserts the expected status. This is the single best proof for the SSDLC form.
- [ ] Route guards: confirm every page under `(app)` that is role specific (`company`, `moderation`) also has its API protected. Hiding a sidebar link is not access control.
- [ ] CSP on a production build (SECURITY gap 1): either force dynamic rendering on affected pages or switch to hashed scripts, then check the production build actually hydrates. Do not claim a strict CSP if it was not verified.
- [ ] `pnpm audit`, secrets scan, dependency pinning, `DEMO_MODE` is off by default and not in `.env.example` as true.
- [ ] Update `SECURITY.md` (new threat rows, closed gaps, remaining gaps, the simulated integrations) and the POPIA section.

Quality
- [ ] **Playwright golden path:** sign up, verify via Mailpit, profile, marks, match, compare funding, apply, simulated offer, accept, create study plan, see it on the calendar, privacy export. It doubles as the demo rehearsal.
- [ ] Visual QA at 360, 768 and 1280 px, every screen in all five states, keyboard pass, axe accessibility scan on each page, Lighthouse run.
- [ ] Low bandwidth check (throttle to slow 4G): Home usable in under 3 seconds.
- [ ] Remove every leftover English only string on key screens, review isiZulu with a native speaker.

Deploy and demo
- [ ] Deploy somewhere stable (TLS on, `TRUST_PROXY_HOPS` set, real SMTP or Mailpit exposed for judges), seeded **demo account for judges** with a pre-verified email, and a **second fresh account path** so judges can sign up themselves.
- [ ] Deck (PDF, 10 slides max, outline in the build instructions), 90 second demo video (script from `docs/demo-script.md`, link on the slides), SSDLC form (copy from `SECURITY.md` and the matrix test), Lean Business Canvas (companies pay for talent search, institutions and funders pay for promoted listings, free for learners), Sonke submission well before **Mon 23:59**.

---

## 5. Data model and API additions in one place

| Item | Type | Milestone |
|---|---|---|
| Application status: `UNDER_REVIEW`, `OFFER_ISSUED`, `ACCEPTED`, `DECLINED` | enum or string, shared Zod | M3 |
| `POST /api/admin/applications/:id/offer`, `POST /api/offers/:id/respond`, `POST /api/applications/:id/simulate-review` (demo only) | routes | M3 |
| `GET /api/dashboard` | route | M2 |
| `StudyBlock` Zod schema, `PATCH /api/study-plans/:id/blocks/:blockId`, `GET /api/calendar` | schema, routes | M4 |
| `Notification`, `MoneyPlan` or `paydayDay`, nudge job, `POST /api/demo/run-nudges` (demo only) | models, job | M5 |
| `DELETE /api/clinic/bookings/:id` | route | M5 |
| `GET /api/privacy/consents`, notifications routes | routes | M6 |
| `Block`, conversations, report evidence and resolution, moderation routes, message stream | models, routes | M7 |
| `ConnectionRequest`, CV route | model, route | M8 |
| `riskScore` function in shared, Home card data in `GET /api/dashboard` | function | M9 |

Every new model gets a migration, a Zod schema in `packages/shared`, ownership scoped queries through the data layer, and tests. Every creating POST gets `Idempotency-Key`.

## 6. Definition of done for any screen

1. Uses only tokens and shadcn components from the redesigned kit.
2. Empty, loading, error, populated and slow states all designed.
3. Works at 360 px and 1280 px, by keyboard, and with reduced motion.
4. Reads and writes only through tested API routes, which enforce auth and ownership.
5. Strings exist in English and isiZulu (key screens).
6. OWASP self-check items ticked for each route it touches.
7. Added to the Playwright run if it is on the golden path.

## 7. Risks to watch

- **Time.** The cut lines exist for a reason. Protect M10.
- **Calendar scope creep.** Do not add recurring events, invitations or time zone pickers. Johannesburg time only.
- **Demo only endpoints.** `DEMO_MODE` routes must be impossible to enable by accident in production. Test that they return 404 when the flag is off.
- **Honesty.** Offers, NSFAS and institutions are simulated. Say so in the UI, the deck and `SECURITY.md`.
- **Palette.** Verify contrast with a tool before you build many screens on it. Changing a token later is cheap, rebuilding screens is not.
- **isiZulu quality.** Machine translated isiZulu can be wrong or awkward. Get a native speaker to check the shell strings.