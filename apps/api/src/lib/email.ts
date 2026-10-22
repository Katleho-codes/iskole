/**
 * Transactional email. Mailpit locally (SMTP on 1025, UI on 8025); a provider in
 * deployment. Called only from the API, never from the browser.
 *
 * Security notes:
 * - No PII in logs: log the template name and the recipient's user id only.
 * - Emails are sent without awaiting in auth flows to avoid timing attacks
 *   (better-auth docs: /docs/authentication/email-password#email-verification).
 */
import nodemailer from 'nodemailer';
import { env } from './env';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: env.MAIL_HOST,
  port: env.MAIL_PORT,
  secure: false, // Mailpit and provider submission start on plain SMTP; TLS is a deployment setting
  ignoreTLS: env.NODE_ENV !== 'production',
});

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  /** Record id used for logging, never the address or body. */
  userId?: string;
  template?: string;
};

export async function sendMail({ to, subject, text, userId, template }: MailMessage): Promise<void> {
  try {
    await transporter.sendMail({ from: env.MAIL_FROM, to, subject, text });
    logger.info({ userId, template }, 'mail sent');
  } catch (error) {
    logger.error({ userId, template, err: error instanceof Error ? error.message : 'unknown' }, 'mail failed');
    throw error;
  }
}
