/**
 * Request context helpers.
 *
 * clientIp returns the caller's address for rate-limit and security-event records.
 * It is stored on SecurityEvent to support brute-force investigation, never logged
 * together with personal data. The value is truncated to 45 characters (the longest
 * possible IPv6 textual form plus an IPv4-mapped prefix).
 */
import type { Request } from 'express';

export function clientIp(req: Request): string | undefined {
  // Express only fills req.ip from X-Forwarded-For when trust proxy is configured,
  // which it deliberately is not under local dev. Keep the value as-is and truncate.
  const ip = req.ip ?? req.socket.remoteAddress;
  if (!ip) return undefined;
  return ip.slice(0, 45);
}
