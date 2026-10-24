/**
 * OpenRouter client. Plain fetch, no SDK.
 *
 * Docs read before writing this file (OpenRouter normalises the schema across providers, so
 * one shape works for every model):
 *   - Overview and request schema: https://openrouter.ai/docs/api-reference/overview
 *   - Model fallbacks (`models` array): https://openrouter.ai/docs/guides/routing/model-fallbacks
 *   - Provider routing (`require_parameters`, `zdr`, `data_collection`):
 *     https://openrouter.ai/docs/guides/routing/provider-selection
 *   - Zero Data Retention: https://openrouter.ai/docs/guides/features/zdr
 *   - App attribution: https://openrouter.ai/docs/app-attribution
 *
 * Why no SDK: the API is one POST, and every dependency added to a service that handles
 * children's data is another supply-chain surface and another `pnpm audit` finding. A
 * forty-line fetch has no transitive dependencies.
 *
 * What is deliberately NOT done here:
 *   - The prompt is never logged. Neither is the response text. Logging happens in the
 *     caller with record ids only, per the no-PII-in-logs rule.
 *   - The model cannot write. There are no tools and no function calling in this client, so
 *     a prompt injection can produce a bad sentence, never a database change.
 */
import { env } from '../env';
import { logger } from '../logger';

/** The chat completions endpoint. Versioned path, so a breaking change is a new URL. */
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type CompletionRequest = {
  messages: ChatMessage[];
  /** JSON Schema for structured output, or undefined for plain text. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /**
   * Upper bound on returned tokens. Capped here as well as by the schema, because a model
   * that ignores the schema should still not be able to return a novel.
   */
  maxTokens?: number;
  /** Sampling temperature. Kept low: matching explanations should be consistent. */
  temperature?: number;
};

export type CompletionResult = {
  /** The raw assistant text. Unvalidated: the caller passes it through Zod. */
  content: string;
  /** Which model actually answered, which can differ from the primary after a fallback. */
  model: string;
  /** Provider request id, safe to log: it contains no learner data. */
  requestId?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
};

/** Raised when the provider could not answer. Callers degrade rather than fail the request. */
export class AiUnavailableError extends Error {
  public override cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.cause = cause;
  }
}

/**
 * The single seam that tests replace. Everything that talks to the network goes through this
 * one function, so a test can swap it for a fake and never make a real call. Keeping it a
 * module-level binding with an explicit setter (rather than a hidden mock of `fetch`) means
 * a production path that accidentally bypasses the seam is visible in review.
 */
type Transport = (url: string, init: RequestInit) => Promise<Response>;

let transport: Transport = (url, init) => fetch(url, init);

/** Test-only seam. Throws in production so it cannot be used to disable the real client. */
export function __setTransportForTests(next: Transport | null): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('the AI transport cannot be replaced in production');
  }
  transport = next ?? ((url, init) => fetch(url, init));
}

/** The model list sent to OpenRouter: primary first, then fallbacks, in order. */
export function modelList(): string[] {
  const fallbacks = env.OPENROUTER_FALLBACK_MODELS.split(',')
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0);
  return [env.OPENROUTER_MODEL, ...fallbacks];
}

/** True when a key is configured. Callers use this to skip the AI rather than error. */
export function isAiConfigured(): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}

/**
 * Send one completion request. Returns raw text; the caller is responsible for validation.
 *
 * Throws AiUnavailableError for every failure mode: missing key, timeout, non-2xx, or a
 * response with no choices. The caller treats all of them the same way, which is the agreed
 * behaviour: fall back to the deterministic result, never show the learner an error screen.
 */
export async function complete(request: CompletionRequest): Promise<CompletionResult> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AiUnavailableError('no OpenRouter API key is configured');
  }

  const body: Record<string, unknown> = {
    // `models` is the documented way to get server-side failover. Note it is NOT `fallbacks`:
    // that is the Anthropic-Messages-only parameter and sending both returns 400.
    models: modelList(),
    messages: request.messages,
    max_tokens: request.maxTokens ?? 1200,
    temperature: request.temperature ?? 0.2,
    provider: {
      // Only route to endpoints that support every parameter we sent. Without this, a
      // fallback provider that ignores `response_format` would silently return prose where
      // the caller expects JSON.
      require_parameters: true,
      // Deny collection on the provider side. This is learner data; some providers train on
      // what they receive unless asked not to.
      data_collection: 'deny',
      // Stronger than `data_collection: 'deny'`: route only to endpoints that retain nothing
      // at all. If no configured model has a ZDR endpoint, the request fails and the caller
      // degrades to the deterministic result. Retention is the wrong trade for a learner's data.
      zdr: true,
    },
  };

  if (request.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: request.jsonSchema.name,
        strict: true,
        schema: request.jsonSchema.schema,
      },
    };
  }

  // AbortSignal.timeout gives a hard ceiling. A provider that hangs must not hold an
  // Express request open until the platform kills the connection.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.OPENROUTER_TIMEOUT_MS);

  try {
    const response = await transport(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter uses these for attribution on its dashboard. No learner data in them.
        // `X-OpenRouter-Title` is the current header; `X-Title` is the legacy alias. Keep the
        // app out of public rankings: the audience includes minors, so visibility is hidden.
        'HTTP-Referer': env.APP_URL,
        'X-OpenRouter-Title': 'iskole',
        'X-OpenRouter-App-Visibility': 'hidden',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Status only. The provider's error body can echo the prompt back, so it is not logged.
      logger.warn({ status: response.status }, 'openrouter request failed');
      throw new AiUnavailableError(`provider returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      id?: string;
      model?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new AiUnavailableError('provider returned no content');
    }

    // Token counts and the provider request id are safe to log: no learner data.
    logger.info(
      {
        model: payload.model,
        requestId: payload.id,
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
      },
      'openrouter request completed',
    );

    return {
      content,
      model: payload.model ?? request.jsonSchema?.name ?? 'unknown',
      requestId: payload.id,
      usage: {
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
      },
    };
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    // Timeout, DNS failure, TLS failure, malformed JSON. All the same to the caller.
    const reason = error instanceof Error && error.name === 'AbortError' ? 'timed out' : 'failed';
    logger.warn({ reason }, 'openrouter request did not complete');
    throw new AiUnavailableError(`openrouter request ${reason}`, error);
  } finally {
    clearTimeout(timer);
  }
}
