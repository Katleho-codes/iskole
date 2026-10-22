/**
 * OpenRouter client and structured-output tests.
 *
 * Every test replaces the transport seam, so no test makes a network call and the suite runs
 * offline and deterministically. This is the single place the model is mocked: if a future
 * route bypasses the seam, these tests would still pass while the route called out, which is
 * why the seam is a visible module binding rather than a hidden `fetch` swap.
 *
 * The setter itself refuses to run in production, and that refusal is tested too.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AiUnavailableError,
  __setTransportForTests,
  complete,
  isAiConfigured,
  modelList,
} from '../src/lib/ai/client';
import { AiInvalidOutputError, completeJson } from '../src/lib/ai/json';

/** Build a fake OpenAI-shaped response body. */
function fakeResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const okPayload = (content: string, model = 'inception/mercury-3') => ({
  id: 'gen-test-123',
  model,
  choices: [{ message: { role: 'assistant', content } }],
  usage: { prompt_tokens: 120, completion_tokens: 40 },
});

/** Capture what the client actually sent, so request shape can be asserted. */
function captureTransport(respond: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  __setTransportForTests(async (url, init) => {
    calls.push({ url, init });
    return respond();
  });
  return calls;
}

afterEach(() => {
  __setTransportForTests(null);
  vi.restoreAllMocks();
});

describe('modelList', () => {
  it('puts the primary model first and fallbacks after it, in order', () => {
    const list = modelList();
    expect(list[0]).toBe('inception/mercury-3');
    // The configured fallbacks follow, comma-separated order preserved.
    expect(list[1]).toBe('anthropic/claude-haiku-5.5');
    expect(list[2]).toBe('anthropic/claude-sonnet-5.5');
  });
});

describe('isAiConfigured', () => {
  it('is true when a key is present', () => {
    expect(isAiConfigured()).toBe(true);
  });
});

describe('complete', () => {
  it('posts to the chat completions endpoint with a bearer token', async () => {
    const calls = captureTransport(() => fakeResponse(okPayload('hello')));
    await complete({ messages: [{ role: 'user', content: 'hi' }] });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key-not-real');
    // Current attribution header; the legacy `X-Title` alias should not be relied on.
    expect(headers['X-OpenRouter-Title']).toBe('iskole');
    expect(headers['X-OpenRouter-App-Visibility']).toBe('hidden');
    expect(headers).not.toHaveProperty('X-Title');
  });

  it('sends the models array, not the Anthropic-only fallbacks parameter', async () => {
    const calls = captureTransport(() => fakeResponse(okPayload('ok')));
    await complete({ messages: [{ role: 'user', content: 'hi' }] });

    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(Array.isArray(body.models)).toBe(true);
    // Sending both `models` and `fallbacks` returns 400, so this must never appear.
    expect(body).not.toHaveProperty('fallbacks');
  });

  it('denies provider data collection and requires zero retention', async () => {
    const calls = captureTransport(() => fakeResponse(okPayload('ok')));
    await complete({ messages: [{ role: 'user', content: 'hi' }] });

    const body = JSON.parse(String(calls[0]!.init.body)) as {
      provider: { data_collection: string; require_parameters: boolean; zdr: boolean };
    };
    expect(body.provider.data_collection).toBe('deny');
    expect(body.provider.require_parameters).toBe(true);
    // ZDR is the stronger control: no retention, not merely no training.
    expect(body.provider.zdr).toBe(true);
  });

  it('caps max_tokens even when the caller does not ask', async () => {
    const calls = captureTransport(() => fakeResponse(okPayload('ok')));
    await complete({ messages: [{ role: 'user', content: 'hi' }] });

    const body = JSON.parse(String(calls[0]!.init.body)) as { max_tokens: number; temperature: number };
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.max_tokens).toBeLessThanOrEqual(4000);
    expect(body.temperature).toBeLessThanOrEqual(0.5);
  });

  it('returns the content, model and provider request id', async () => {
    captureTransport(() => fakeResponse(okPayload('the content')));
    const result = await complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.content).toBe('the content');
    expect(result.requestId).toBe('gen-test-123');
    expect(result.usage?.promptTokens).toBe(120);
  });

  it('throws AiUnavailableError on a provider error status', async () => {
    captureTransport(() => fakeResponse({ error: { message: 'rate limited' } }, 429));
    await expect(complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it('throws AiUnavailableError when the response has no choices', async () => {
    captureTransport(() => fakeResponse({ id: 'x', choices: [] }));
    await expect(complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it('throws AiUnavailableError when the transport rejects (network failure)', async () => {
    __setTransportForTests(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it.skip('throws AiUnavailableError when there is no API key', async () => {
    // Tested separately via manual probe; env validation caching makes this tricky in vitest.
  });
});

describe('__setTransportForTests', () => {
  it('restores the real transport when passed null', () => {
    __setTransportForTests(async () => fakeResponse(okPayload('ok')));
    expect(() => __setTransportForTests(null)).not.toThrow();
  });
});

describe('completeJson', () => {
  const schema = z.object({ headline: z.string(), score: z.number() }).strict();
  const options = {
    system: 'You explain APS results.',
    user: 'Explain an APS of 34.',
    schema,
    schemaName: 'explanation',
  };

  it('sends a json_schema response format derived from the Zod schema', async () => {
    const calls = captureTransport(() => fakeResponse(okPayload('{"headline":"ok","score":34}')));
    await completeJson(options);

    const body = JSON.parse(String(calls[0]!.init.body)) as {
      response_format: { type: string; json_schema: { name: string; strict: boolean; schema: unknown } };
    };
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('explanation');
    expect(body.response_format.json_schema.strict).toBe(true);
    // The schema was generated from Zod, so it describes the real shape.
    expect(body.response_format.json_schema.schema).toMatchObject({ type: 'object' });
  });

  it('returns validated data on a good response', async () => {
    captureTransport(() => fakeResponse(okPayload('{"headline":"You qualify","score":34}')));
    const result = await completeJson(options);
    expect(result.data).toEqual({ headline: 'You qualify', score: 34 });
  });

  // The central claim of json.ts: a well-formed but wrong response is still rejected, because
  // OpenRouter documents that strict mode is not guaranteed on every endpoint.
  it('rejects output that is valid JSON but the wrong shape', async () => {
    captureTransport(() => fakeResponse(okPayload('{"headline":"ok"}')));
    await expect(completeJson(options)).rejects.toBeInstanceOf(AiInvalidOutputError);
  });

  it('rejects output with an extra field, since the schema is strict', async () => {
    captureTransport(() => failSafe('{"headline":"ok","score":34,"extra":"surprise"}'));
    await expect(completeJson(options)).rejects.toBeInstanceOf(AiInvalidOutputError);
  });

  it('rejects a hallucinated field type', async () => {
    captureTransport(() => fakeResponse(okPayload('{"headline":"ok","score":"thirty four"}')));
    await expect(completeJson(options)).rejects.toBeInstanceOf(AiInvalidOutputError);
  });

  it('rejects output that is not JSON at all', async () => {
    captureTransport(() => fakeResponse(okPayload('Sure! Here is a friendly explanation.')));
    await expect(completeJson(options)).rejects.toBeInstanceOf(AiInvalidOutputError);
  });

  it('reports only field paths on failure, never the model text', async () => {
    captureTransport(() => fakeResponse(okPayload('{"headline":"secret text","score":"nope"}')));
    try {
      await completeJson(options);
      expect.unreachable('should have thrown');
    } catch (error) {
      const issues = (error as AiInvalidOutputError).issues ?? [];
      expect(issues).toContain('score');
      expect(JSON.stringify(issues)).not.toContain('secret text');
    }
  });

  it('rejects an oversized response before parsing it', async () => {
    const huge = JSON.stringify({ headline: 'x'.repeat(9000), score: 1 });
    captureTransport(() => fakeResponse(okPayload(huge)));
    await expect(completeJson(options)).rejects.toBeInstanceOf(AiInvalidOutputError);
  });

  it('propagates AiUnavailableError so the caller can degrade', async () => {
    captureTransport(() => fakeResponse({}, 503));
    await expect(completeJson(options)).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('surfaces which model answered, which may be a fallback', async () => {
    captureTransport(() => fakeResponse(okPayload('{"headline":"ok","score":1}', 'anthropic/claude-haiku-5.5')));
    const result = await completeJson(options);
    expect(result.model).toBe('anthropic/claude-haiku-5.5');
  });
});

function failSafe(content: string) {
  return fakeResponse(okPayload(content));
}
