import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup.ts'],
    // Tests share one real database, so run files one at a time to keep them independent.
    fileParallelism: false,
    // Test env values are fake placeholders; real secrets only ever live in .env, which is gitignored.
    env: {
      NODE_ENV: 'test',
      API_PORT: '4010',
      APP_URL: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://iskole:iskole@localhost:5434/iskole_test?schema=public',
      BETTER_AUTH_URL: 'http://localhost:4010',
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-1234',
      SIGNING_SECRET: 'test-signing-secret-test-signing-32b',
      ID_ENCRYPTION_KEY: 'dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcyE',
      UPLOAD_DIR: 'var/test-uploads',
      MAIL_HOST: 'localhost',
      MAIL_PORT: '1025',
      MAIL_FROM: 'iskole@localhost.test',
      DEMO_MODE: 'true',
      // A fake key so the AI client is "configured" in tests. The transport seam is what
      // actually prevents network calls, so a real key would still never be used. The
      // no-key degradation path is tested separately by clearing it before import.
      OPENROUTER_API_KEY: 'test-key-not-real',
      OPENROUTER_MODEL: 'inception/mercury-3',
      OPENROUTER_FALLBACK_MODELS: 'anthropic/claude-haiku-5.5,anthropic/claude-sonnet-5.5',
    },
  },
});
