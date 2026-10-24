/**
 * Input guards for anything that leaves the server for a third party model provider.
 *
 * The rule from the build instructions, stated once so it is not re-derived per feature:
 * user text is untrusted, and no ID number, contact detail or other learner's data may
 * appear in a prompt. The model provider is a third party. Whatever we send it has left
 * POPIA's protection, so the cheapest place to enforce that is here, before the request.
 *
 * Two distinct jobs live in this file, and they are deliberately separate:
 *
 *   1. redactForPrompt: strips or rejects the things we never want to send. It is
 *      conservative on purpose. A false positive costs one AI explanation, which degrades
 *      to the deterministic result. A false negative leaks a child's ID number to a
 *      provider, which cannot be undone.
 *
 *   2. AiRateLimiter: a per-account daily cap. The route limiter counts per IP, and many
 *      South African learners share one IP behind NAT or CGNAAT, so a per-IP cap alone
 *      would let one busy school exhaust the allowance for everyone behind it. This cap is
 *      keyed by the authenticated user id instead.
 */

/** An ID number would be sent to a provider. Rendering the whole prompt is the safe choice. */
export class PromptRejectedError extends Error {
  public readonly reason: 'ID_NUMBER' | 'EMAIL' | 'PHONE' | 'TOO_LONG' | 'EMPTY';

  constructor(
    reason: 'ID_NUMBER' | 'EMAIL' | 'PHONE' | 'TOO_LONG' | 'EMPTY',
    message: string,
  ) {
    super(message);
    this.name = 'PromptRejectedError';
    this.reason = reason;
  }
}

/**
 * South African ID numbers are 13 digits, either bare or spaced in the common
 * `YYMMDD SSSS C A Z` groupings. A 13-digit run is matched by digits alone, not by the
 * date part, because checking the date would make the guard miss malformed-but-real IDs
 * that a learner might have typed with a typo.
 *
 * Bank cards and phone numbers are also 13 digits or longer, but those are contact details
 * we do not want in a prompt either, so a single pattern covers both classes safely.
 */
const ID_NUMBER_PATTERN = /\b\d{13}\b/;

/** Strip separators and look for any 13-digit sequence (handles spaced/dashed IDs). */
function containsIdNumber(text: string): boolean {
  if (ID_NUMBER_PATTERN.test(text)) return true;
  const stripped = text.replace(/[\s-]/g, '');
  return /\d{13}/.test(stripped);
}

/** Any run of 9+ digits, which covers phone numbers with or without separators. */
const LONG_DIGIT_RUN_PATTERN = /(?:\d[\s-]?){9,}/;

/** Standard email shape. Deliberately loose: a false positive is the safe direction here. */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export type RedactionResult = {
  /** The text that is safe to send. Only present when nothing was rejected. */
  text: string;
  /** Which checks tripped. Empty when the text passed. */
  rejected: PromptRejectedError['reason'][];
};

/**
 * Check a piece of text for anything that must not reach a model provider.
 *
 * This rejects rather than silently rewrites. Silently removing a number produces a prompt
 * that reads as though the learner wrote something they did not, and the explanation would
 * then be about a different person's marks than the ones on screen. Rejecting is honest:
 * the caller degrades to the deterministic result and says so.
 *
 * @param text the assembled prompt fragment
 * @param maxChars cap from @iskole/shared LIMITS.maxAiInputChars, enforced here too
 */
export function redactForPrompt(text: string, maxChars: number): RedactionResult {
  const rejected: PromptRejectedError['reason'][] = [];

  if (text.trim().length === 0) rejected.push('EMPTY');
  if (text.length > maxChars) rejected.push('TOO_LONG');
  if (containsIdNumber(text)) rejected.push('ID_NUMBER');
  if (EMAIL_PATTERN.test(text)) rejected.push('EMAIL');
  // Only flag a phone-like run when it is not already counted as an ID number, so the
  // reason list names the most specific cause.
  else if (LONG_DIGIT_RUN_PATTERN.test(text) && !containsIdNumber(text)) {
    rejected.push('PHONE');
  }

  return { text, rejected };
}

/**
 * Throw when the text is not safe to send. Routes call this before building a request so a
 * rejection cannot be forgotten: an unguarded call is a visible error, not a quiet leak.
 */
export function assertSafeForPrompt(text: string, maxChars: number): string {
  const { rejected } = redactForPrompt(text, maxChars);
  if (rejected.length > 0) {
    const reason = rejected[0]!;
    throw new PromptRejectedError(reason, `prompt rejected: ${reason.toLowerCase()}`);
  }
  return text;
}

/** Human-readable reason, for logs and for the response flag. Never includes the text. */
export function describeRejection(reason: PromptRejectedError['reason']): string {
  switch (reason) {
    case 'ID_NUMBER':
      return 'the request contained what looks like an ID number';
    case 'EMAIL':
      return 'the request contained what looks like an email address';
    case 'PHONE':
      return 'the request contained what looks like a phone number';
    case 'TOO_LONG':
      return 'the request was too long to send';
    case 'EMPTY':
      return 'there was nothing to explain';
  }
}

/**
 * Per-account daily cap, held in memory.
 *
 * In-memory is a deliberate, documented limitation: it resets on restart and does not span
 * multiple API instances. That is acceptable here because it is a cost guard on a hackathon
 * deployment, not a security control. The security controls are the per-IP route limiter,
 * which is already in place, and the redaction above. If iskole ran multi-instance this
 * would move to a table keyed by (userId, day). Noted in SECURITY.md so it is not mistaken
 * for a distributed rate limit.
 */
export class AiRateLimiter {
  private readonly buckets = new Map<string, { day: string; count: number }>();

  constructor(private readonly dailyLimit: number) {}

  /** Today in UTC, so the bucket boundary does not depend on the server's timezone. */
  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Record one call for this account. Returns false when the cap is already reached, in
   * which case the caller degrades rather than calling the provider.
   */
  tryConsume(userId: string): boolean {
    const day = this.today();
    const bucket = this.buckets.get(userId);

    if (!bucket || bucket.day !== day) {
      this.buckets.set(userId, { day, count: 1 });
      return true;
    }

    if (bucket.count >= this.dailyLimit) return false;

    bucket.count += 1;
    return true;
  }

  /** How many calls this account has left today. Used by tests and the health of the UI. */
  remaining(userId: string): number {
    const bucket = this.buckets.get(userId);
    if (!bucket || bucket.day !== this.today()) return this.dailyLimit;
    return Math.max(0, this.dailyLimit - bucket.count);
  }
}
