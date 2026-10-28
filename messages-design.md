# Messages — Design, Build and Verification Checklist

Direct messaging from search to reply. Tick an item only when the behaviour exists **and**
has been exercised (browser test, API request, or a targeted manual check).

Legend: `[x]` built and verified · `[ ]` outstanding.

## 0. How the flow fits together

```
/messages (client)
  ├─ GET  /api/users/search?email=…        find a person, excludes yourself
  ├─ POST /api/conversations               create or reuse the 1:1 thread
  ├─ GET  /api/conversations               list threads + last message
  ├─ GET  /api/conversations/:id/messages   read a thread (participants only)
  ├─ POST /api/conversations/:id/messages   send
  ├─ GET  /api/blocks                      block state for the UI
  └─ POST/DELETE /api/blocks               block / unblock a person
```

Every mutating call carries an `Idempotency-Key` header (see `apps/web/src/lib/api-client.ts`).
Without it the API answers `400 this request requires an Idempotency-Key header`; that was the
original "Start does nothing" bug.

## 1. API — conversations (`apps/api/src/routes/conversations.ts`)

- [x] `GET /api/conversations` returns the signed-in learner's threads
  - [x] other participant's id, name and email
  - [x] last message preview + `updatedAt`
  - [x] newest activity first (`updatedAt desc`)
  - [x] no duplicate rows for the same pair
- [x] `POST /api/conversations` creates or reuses a thread
  - [x] `requireSession` + `idempotent()`
  - [x] rejects messaging yourself (`400 cannot message yourself`)
  - [x] rejects a pair where either side blocked the other (`403`)
  - [x] rejects adult ↔ minor pairs (`403 age-restricted messaging`)
  - [x] returns the existing thread for the same pair instead of creating another
  - [x] returns `201` with `{ conversation }`
- [x] `GET /api/conversations/:id/messages`
  - [x] participants only (`403 not a participant` for outsiders)
  - [x] `404` for an unknown thread
  - [x] blocked pairs read as an empty thread
  - [x] oldest first, so the thread reads top to bottom
- [x] `POST /api/conversations/:id/messages`
  - [x] `requireSession` + `idempotent()`
  - [x] body trimmed, 1–2000 characters
  - [x] participant, block and age checks before writing
  - [x] writes the message and bumps `conversation.updatedAt`
  - [x] returns `201` with the created message

## 2. API — people and blocks

- [x] `GET /api/users/search?email=` (`apps/api/src/routes/users.ts`)
  - [x] signed-in only
  - [x] case-insensitive partial match
  - [x] the caller is excluded from the results
  - [x] capped at 10 results; name, email and id only
- [x] `GET /api/blocks` powers the block state in the thread
- [x] `POST /api/blocks` is idempotent by unique constraint
- [x] `DELETE /api/blocks/:userId` removes the block
- [x] `isBlocked` checks both directions, so a block on either side stops messaging

## 3. Web — `/messages` (`apps/web/src/app/(app)/messages/page.tsx`)

### Finding someone
- [x] email search input, Enter or the search button
- [x] searching state on the button
- [x] empty-result message ("No one matched that email")
- [x] your own account never appears

### Starting a thread
- [x] **Start** calls `POST /api/conversations` with `recipientId`
- [x] per-result loading state; every Start disables while one is in flight
- [x] on success the search clears, the list refreshes and the thread opens
- [x] on refusal the API message is shown in a dismissible alert
- [x] starting a chat with someone you already have a thread with opens that thread

### Thread list
- [x] loads on mount and every 15s while the tab is visible
- [x] name, last message preview and time
- [x] selected thread is visually marked
- [x] empty state when there is nothing yet

### Thread
- [x] messages oldest first, own messages right-aligned
- [x] empty state ("No messages yet. Say hello.")
- [x] auto-scrolls to the newest message
- [x] refreshes every 4s while visible, so a reply arrives without a reload
- [x] slow responses for a thread you already left are ignored

### Sending
- [x] send button and Enter (Shift+Enter is not needed: the input is single line)
- [x] empty or whitespace-only input keeps Send disabled
- [x] input clears only after a successful send
- [x] thread and list refresh after sending
- [x] blocked state disables the composer with a clear placeholder

### Blocking
- [x] Block button in the thread header, with a confirmation dialog
- [x] after blocking: notice shown, composer disabled, messages empty
- [x] Unblock restores the composer
- [x] attempts to start a blocked conversation show the API refusal

### Resilience and accessibility
- [x] one inline error banner for search, start, send and block failures
- [x] no silent `catch {}` on user-visible actions
- [x] labels on the search input, `aria-live` on the thread, `role="alert"` on errors
- [x] layout stacks to one column on a phone viewport

## 4. Supporting fixes made for this flow

- [x] `apps/web/src/lib/api-client.ts`: `postJson` / `mutateJson` / `getJson` add the
  `Idempotency-Key` and turn API errors into readable messages
- [x] `apps/web/src/app/(app)/communities/page.tsx`: admin community creation used a bare
  `fetch` with no key (so the API refused it); now goes through `postJson`
- [x] `apps/api/src/routes/conversations.ts`: removed debug `console.log` calls; list now
  returns `otherUserEmail`
- [x] `apps/api/src/routes/users.ts`: self excluded from search
- [x] `apps/web/src/app/layout.tsx`: `next-themes` inline script receives the CSP nonce from
  `proxy.ts` (strict `script-src` no longer blocks the theme script), and `<html>` carries
  `suppressHydrationWarning` because that script sets the theme class and `color-scheme`
  before React hydrates
- [x] `apps/api/src/routes/community.ts`, `apps/api/src/routes/cv.ts`: fixed pre-existing
  type errors so `pnpm --filter @iskole/api typecheck` passes
- [x] `e2e/auth.spec.ts`, `e2e/m5-m6.spec.ts`: adapted to the no-email-verification sign-up

## 5. Verification evidence

### Browser (Playwright, Chromium)
`npx playwright test e2e/messages.spec.ts` — 2 passed.

- [x] **Full exchange**: a fresh learner signs up, searches `demo@iskole.app`, clicks Start,
  sends, the demo account signs in, sees the message, replies, and the learner signs back in
  to see the reply. No CSP violations in the console.
- [x] **Empty send**: Send is disabled until text is entered.
- [x] **Phone viewport**: `/messages` remains usable at 375×667.
- [x] **Block/unblock**: demo blocks the new learner from the thread, the composer disables,
  a Start attempt on the blocked person shows the refusal, Unblock restores the composer.
- [x] **CSP**: theme script renders with a nonce; no `script-src` violation is logged.
- [x] **Dark mode** (`npx playwright test e2e/theme.spec.ts`): the top-bar toggle flips the
  `dark` class, survives a reload, and logs no CSP violation or hydration mismatch.

### API (live requests against `http://localhost:8004`)

| Case | Result |
| --- | --- |
| create conversation | `201`, thread id returned |
| repeat the same pair with a new idempotency key | `201`, same id — no duplicate |
| send message | `201` |
| list conversations | `200` with preview and `otherUserEmail` |
| message yourself | `400 cannot message yourself` |
| POST without `Idempotency-Key` | `400` |
| non-participant reads a thread | `403 not a participant` |
| blocked pair: create | `403 cannot start a conversation with this user` |
| blocked pair: send | `403 blocked` |
| blocked pair: read | `200 { messages: [] }` |
| adult → minor: create and send | `403 age-restricted messaging` |
| search with mixed case, partial domain | `200`, match found |
| search that only matches yourself | `200`, `count=0` |
| `pnpm --filter @iskole/api typecheck` | exit `0` |
| `pnpm --filter @iskole/web typecheck` | exit `0` |

## 6. Deliberate limits

- Direct messages are **not encrypted at rest** by decision; the thread is only reachable by
  its two participants.
- Live updates are **4s polling**, not SSE. It behaves the same for a learner and adds no
  connection state to the API. Community messages keep their `/api/messages/stream` SSE.
- Accounts with no date of birth are treated as adults for the age gate. Admins and seeded
  staff have no learner profile, and the requirement is that admins can still use chat. Public
  learner sign-up always collects a date of birth during onboarding.
- Blocking is one-directional to create, enforced in both directions when reading or writing.

## 7. Not in scope for this milestone

- [ ] Group conversations
- [ ] Attachments or images in direct messages
- [ ] Read receipts / typing indicators
- [ ] Unread counts per thread (the sidebar badge is notifications only)
- [ ] Message deletion or editing
