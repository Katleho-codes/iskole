/**
 * Structured output helper.
 *
 * The important thing about this file is that it does two things, not one. It sends a JSON
 * Schema to OpenRouter so the model is nudged into a parseable shape, and it separately
 * validates the returned text with the same Zod schema.
 *
 * Why the second step is not redundant: OpenRouter's structured-output docs
 * (https://openrouter.ai/docs/features/structured-outputs) state that enforcement is a
 * property of the endpoint, not of the model, and that "exact compliance is not guaranteed
 * on every endpoint". So the schema is a hint that greatly improves reliability, and Zod is
 * the actual guarantee. Treating the API's schema as validation would mean trusting a third
 * party to enforce our contract, with learner-facing output as the failure mode.
 *
 * One source of truth: the JSON Schema sent in the request and the Zod schema that validates
 * the response are derived from the same Zod object, so they cannot drift apart.
 */
import { z } from 'zod';
import { LIMITS } from '@iskole/shared';
import { AiUnavailableError, complete, isAiConfigured, type ChatMessage } from './client';

/** Thrown when the model answered, but not in the shape we asked for. */
export class AiInvalidOutputError extends Error {
  public readonly issues?: string[];

  constructor(message: string, issues?: string[]) {
    super(message);
    this.name = 'AiInvalidOutputError';
    this.issues = issues;
  }
}

export type StructuredCompletion<T> = {
  data: T;
  model: string;
  requestId?: string;
};

/**
 * Ask the model for an object matching `schema`, then validate it.
 *
 * `system` and `user` are separate so the system instruction stays fixed and only the user
 * half varies. Nothing here logs either one.
 */
export async function completeJson<T>(options: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Name OpenRouter uses to identify the schema. Must match the slug pattern. */
  schemaName: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<StructuredCompletion<T>> {
  if (!isAiConfigured()) {
    throw new AiUnavailableError('no OpenRouter API key is configured');
  }

  // Derive the JSON Schema from the same Zod schema that will validate the answer.
  // z.toJSONSchema is built into Zod v4, so no extra dependency is needed for this.
  const jsonSchema = z.toJSONSchema(options.schema, {
    // OpenRouter's strict mode rejects some JSON Schema keywords it does not implement.
    // Dropping unsupported annotations keeps the schema acceptable without weakening it.
    unrepresentable: 'any',
    io: 'output',
  }) as Record<string, unknown>;

  const messages: ChatMessage[] = [
    { role: 'system', content: options.system },
    { role: 'user', content: options.user },
  ];

  const result = await complete({
    messages,
    jsonSchema: { name: options.schemaName, schema: jsonSchema },
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });

  // Cap before parsing. A response larger than the shared ceiling is not something we asked
  // for and not something we want to hold in memory or log.
  if (result.content.length > LIMITS.maxAiOutputChars) {
    throw new AiInvalidOutputError('model output exceeded the size limit');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    throw new AiInvalidOutputError('model output was not valid JSON');
  }

  const validated = options.schema.safeParse(parsed);
  if (!validated.success) {
    // Only the field paths are surfaced, never the values, so a failure cannot leak the
    // model's text into a log line or an API response.
    const issues = validated.error.issues.map((issue) => issue.path.join('.') || '(root)');
    throw new AiInvalidOutputError('model output did not match the expected shape', issues);
  }

  return { data: validated.data, model: result.model, requestId: result.requestId };
}
