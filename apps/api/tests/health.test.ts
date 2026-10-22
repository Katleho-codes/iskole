import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

describe('GET /health', () => {
  it('returns 200 with the service status', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'iskole-api' });
  });

  it('sets security headers on every response', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('sends a CSP with no unsafe-inline for scripts', async () => {
    const res = await request(createApp()).get('/api/health');
    const csp = String(res.headers['content-security-policy']);
    const scriptSrc = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('does not advertise the framework', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
