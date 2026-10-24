---
name: sa-id-validation
description: Use whenever handling South African ID numbers in Sekolo — validating input, storing, searching, or displaying a learner's or guardian's identity document. Covers the 13-digit SA ID format, Luhn check digit, the idType fallback for people without an SA ID, and the never-log-raw-ID rule.
---

# South African ID number handling in Sekolo

Not every learner or guardian has a South African ID number (foreign nationals, very young children with only a birth certificate). Sekolo always captures `idType` alongside `idNumber`, and only validates against the SA ID format when `idType` is `SA_ID`.

## 1. idType enum

```prisma
enum IdType {
  SA_ID
  PASSPORT
  BIRTH_CERT
  PERMIT
}
```

`idNumber` is nullable at the schema level. A `BIRTH_CERT` entry may have no number at all, just a document upload (see `Document` model). Never force a value into `idNumber` to satisfy a non-null constraint.

## 2. SA ID format and the Luhn check

A valid SA ID number is exactly 13 digits: `YYMMDDSSSSCAZ`

- `YYMMDD` — date of birth
- `SSSS` — gender sequence (0000–4999 female, 5000–9999 male)
- `C` — citizenship (0 = SA citizen, 1 = permanent resident)
- `A` — usually 8 or 9, historically a race indicator, now unused/ignored
- `Z` — Luhn check digit

Validation in `packages/shared/src/validation/saId.ts`:

```ts
export function isValidSaId(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  if (!isValidLuhn(value)) return false;
  if (!isValidEmbeddedDate(value.slice(0, 6))) return false;
  return true;
}

function isValidLuhn(digits: string): boolean {
  // standard Luhn check over all 13 digits, last digit is the check digit
}

function isValidEmbeddedDate(yymmdd: string): boolean {
  // confirm month 01-12 and day valid for that month; don't guess the century,
  // just confirm the date itself is plausible
}
```

Write unit tests covering: a known-valid ID, a check-digit-off-by-one ID, a too-short string, a too-long string, non-digit characters, and a structurally valid-looking but impossible date (e.g. month 13).

Use this validator as a Zod `.refine()` on any input schema where `idType === 'SA_ID'`:

```ts
const personSchema = z.object({
  idType: z.enum(['SA_ID', 'PASSPORT', 'BIRTH_CERT', 'PERMIT']),
  idNumber: z.string().optional(),
}).refine(
  (data) => data.idType !== 'SA_ID' || (data.idNumber && isValidSaId(data.idNumber)),
  { message: 'Invalid South African ID number', path: ['idNumber'] }
);
```

For `PASSPORT` and `PERMIT`, accept any reasonable non-empty string; don't apply SA-specific format rules.

## 3. Storage: encrypt at rest, hash for lookup

`idNumber` is sensitive personal data and is encrypted at rest, never stored in plaintext.

- Store two columns: `idNumberEncrypted` (AES-GCM, key from environment config, never hardcoded or committed) and `idNumberHash` (HMAC-SHA256 with a server-side secret, deterministic so it can be looked up).
- Do the encryption/hashing in a Prisma Client Extension or a dedicated service function, applied automatically on write, so individual feature code never has to remember to call it.
- To search by ID number, hash the search input the same way and query `idNumberHash`, not `idNumberEncrypted`.
- `@@unique([schoolId, idNumberHash])` enforces per-school uniqueness without ever decrypting.

## 4. Never log the raw ID number

- Don't include `idNumber` in `console.log`, error messages, request logs, or the audit log's plaintext fields.
- The audit log (`AuditLog.beforeJson` / `afterJson`) must redact or omit `idNumber` entirely rather than capturing it — log that the field changed, not its value.
- In the UI, mask the ID number by default (e.g. show only the last 4 digits) and require an explicit action to reveal it, scoped by role.

## Quick self-check before marking the work done

- [ ] `idType` captured alongside `idNumber`, SA ID validation only applied when `idType === 'SA_ID'`
- [ ] Luhn + format validator has unit tests for valid, invalid-checksum, and malformed input
- [ ] `idNumber` encrypted at rest, with a separate hash column for lookups
- [ ] Uniqueness constraint is `[schoolId, idNumberHash]`, not a bare or global unique
- [ ] No code path logs or audits the raw ID number in plaintext
- [ ] UI masks the ID number by default
