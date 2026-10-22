/**
 * AI guard tests. Pure functions, no network, no database.
 *
 * These tests exist to make one claim provable rather than asserted: a prompt containing an
 * ID number or contact details never reaches the provider. The guard is the only thing
 * standing between learner text and a third party, so it gets the bulk of the attention.
 */
import { describe, expect, it } from 'vitest';
import { LIMITS } from '@iskole/shared';
import {
  AiRateLimiter,
  PromptRejectedError,
  assertSafeForPrompt,
  describeRejection,
  redactForPrompt,
} from '../src/lib/ai/guard';

describe('redactForPrompt', () => {
  it('passes ordinary learner text through unchanged', () => {
    const text = 'I enjoy mathematics and want to work in health care.';
    const result = redactForPrompt(text, LIMITS.maxAiInputChars);
    expect(result.text).toBe(text);
    expect(result.rejected).toEqual([]);
  });

  it('rejects a bare 13-digit South African ID number', () => {
    const result = redactForPrompt('My ID is 9001015800085 please check it', LIMITS.maxAiInputChars);
    expect(result.rejected).toContain('ID_NUMBER');
  });

  it('rejects an ID number written with spaces', () => {
    const result = redactForPrompt('id: 900101 5800 085', LIMITS.maxAiInputChars);
    expect(result.rejected).toContain('ID_NUMBER');
  });

  it('rejects an email address', () => {
    const result = redactForPrompt('email me on thandi@example.co.za', LIMITS.maxAiInputChars);
    expect(result.rejected).toContain('EMAIL');
  });

  it('rejects a phone number', () => {
    const result = redactForPrompt('call me on 082 123 4567', LIMITS.maxAiInputChars);
    expect(result.rejected).toContain('PHONE');
  });

  it('does not flag a short number that is just a mark', () => {
    // Marks are numbers we do send. A guard that rejected "72" would break matching.
    expect(redactForPrompt('Mathematics 72, Physical Sciences 65', LIMITS.maxAiInputChars).rejected).toEqual(
      [],
    );
  });

  it('does not flag a year or a small count as a phone number', () => {
    expect(redactForPrompt('I finished school in 2024', LIMITS.maxAiInputChars).rejected).toEqual([]);
  });

  it('rejects text longer than the shared cap', () => {
    const result = redactForPrompt('a'.repeat(LIMITS.maxAiInputChars + 1), LIMITS.maxAiInputChars);
    expect(result.rejected).toContain('TOO_LONG');
  });

  it('rejects empty or whitespace-only text', () => {
    expect(redactForPrompt('', LIMITS.maxAiInputChars).rejected).toContain('EMPTY');
    expect(redactForPrompt('   \n  ', LIMITS.maxAiInputChars).rejected).toContain('EMPTY');
  });

  it('can report more than one reason at once', () => {
    const text = `too long and has an id 9001015800085 ${'x'.repeat(LIMITS.maxAiInputChars)}`;
    const result = redactForPrompt(text, LIMITS.maxAiInputChars);
    expect(result.rejected).toContain('ID_NUMBER');
    expect(result.rejected).toContain('TOO_LONG');
  });
});

describe('assertSafeForPrompt', () => {
  it('returns the text when it is safe', () => {
    expect(assertSafeForPrompt('safe text', LIMITS.maxAiInputChars)).toBe('safe text');
  });

  it('throws with the specific reason for an ID number', () => {
    try {
      assertSafeForPrompt('9001015800085', LIMITS.maxAiInputChars);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PromptRejectedError);
      expect((error as PromptRejectedError).reason).toBe('ID_NUMBER');
    }
  });

  it('never includes the offending text in the error message', () => {
    try {
      assertSafeForPrompt('thandi@example.co.za', LIMITS.maxAiInputChars);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).not.toContain('thandi');
      expect((error as Error).message).not.toContain('example.co.za');
    }
  });
});

describe('describeRejection', () => {
  it('gives a plain-language reason for every case', () => {
    for (const reason of ['ID_NUMBER', 'EMAIL', 'PHONE', 'TOO_LONG', 'EMPTY'] as const) {
      expect(describeRejection(reason)).toBeTruthy();
    }
  });

  it('never leaks the value, since it only receives the reason', () => {
    expect(describeRejection('EMAIL')).toBe('the request contained what looks like an email address');
  });
});

describe('AiRateLimiter', () => {
  it('allows calls up to the daily cap then refuses', () => {
    const limiter = new AiRateLimiter(3);
    expect(limiter.tryConsume('user-a')).toBe(true);
    expect(limiter.tryConsume('user-a')).toBe(true);
    expect(limiter.tryConsume('user-a')).toBe(true);
    expect(limiter.tryConsume('user-a')).toBe(false);
  });

  it('counts each account separately, so one learner cannot exhaust another', () => {
    const limiter = new AiRateLimiter(1);
    expect(limiter.tryConsume('user-a')).toBe(true);
    expect(limiter.tryConsume('user-a')).toBe(false);
    // A different account still has its own allowance. This is the whole point of keying
    // by user id rather than by IP, since learners share IPs behind NAT.
    expect(limiter.tryConsume('user-b')).toBe(true);
  });

  it('reports remaining calls', () => {
    const limiter = new AiRateLimiter(2);
    expect(limiter.remaining('user-a')).toBe(2);
    limiter.tryConsume('user-a');
    expect(limiter.remaining('user-a')).toBe(1);
  });

  it('never reports a negative remaining count', () => {
    const limiter = new AiRateLimiter(1);
    limiter.tryConsume('user-a');
    limiter.tryConsume('user-a');
    expect(limiter.remaining('user-a')).toBe(0);
  });
});
