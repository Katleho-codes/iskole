/**
 * Environment validation. Runs once at startup with Zod so a missing or malformed secret
 * fails fast at boot, never at first use. Values are never logged, only variable names.
 * Template: .env.example at the repo root.
 */
import { config } from 'dotenv';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';

// Load the repo-root .env regardless of the directory the process was started from.
// quiet: a missing .env is normal in tests and CI, env vars come from the runner there.
config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4010),
  /** Public origin of the web app. Used for CSRF Origin checks and links in emails. */
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  /** better-auth secret: 32+ random bytes. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Origin the auth server is reachable at. Used for links in verification and reset emails. */
  BETTER_AUTH_URL: z.string().url().default('http://localhost:4010'),
  /** HMAC key for short-lived signed download URLs. */
  SIGNING_SECRET: z.string().min(32),
  /** AES-256-GCM key for ID numbers. Different per environment. */
  ID_ENCRYPTION_KEY: z.string().min(32),
  /** Uploads live outside the web root and are only served through signed URLs. */
  UPLOAD_DIR: z.string().min(1).default('var/uploads'),

  /**
   * Number of reverse proxies in front of the API. 0 (the default) ignores
   * X-Forwarded-For, so a client cannot spoof its address. Set to 1 when the API is reached
   * through the Next.js rewrite or a single load balancer, otherwise every learner shares
   * the proxy's IP and therefore one rate-limit bucket. Never set this higher than the
   * number of proxies you actually run.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  /** Email. Mailpit locally, a transactional provider when deployed. */
  MAIL_HOST: z.string().min(1).default('localhost'),
  MAIL_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  MAIL_FROM: z.string().min(3).default('iskole@localhost.test'),

  /** Demo-only endpoints (simulate-review). Never true in real production configs. */
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default(process.env.NODE_ENV === 'production' ? 'false' : 'true')
    .transform((value) => value === 'true'),

  /**
   * AI. Server side only. The key is optional so the app boots without it and degrades to
   * the deterministic result, which is the agreed failure behaviour: a missing key must
   * never take the API down, and it must never crash a demo.
   */
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  /** Primary model slug. Structured-output capable, see OPENROUTER_FALLBACK_MODELS. */
  OPENROUTER_MODEL: z.string().min(1).default('inception/mercury-3'),
  /** Comma-separated fallback slugs, tried in order by OpenRouter's `models` array. */
  OPENROUTER_FALLBACK_MODELS: z
    .string()
    .default('anthropic/claude-haiku-5.5,anthropic/claude-sonnet-5.5'),
  /** Ceiling on one AI call, so a hung provider cannot hold an Express request open. */
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  /** Per-account daily AI call cap. Distinct from the per-IP route limiter. */
  AI_DAILY_CALL_LIMIT: z.coerce.number().int().min(1).max(10000).default(100),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const failed = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Invalid environment configuration: ${failed}. Compare .env with .env.example.`);
}

export const env = parsed.data;

