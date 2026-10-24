/**
 * Email verification landing page.
 *
 * better-auth sends the learner to /api/auth/verify-email?token=... (its own endpoint).
 * That endpoint returns JSON, so the verification email sets callbackURL to this page.
 * better-auth appends the outcome as ?error=... when verification fails.
 *
 * This page therefore only reads the outcome: it never verifies anything itself and there
 * is no iskole verify endpoint.
 */
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

type SearchParams = Promise<{ error?: string }>;

export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const unverified = params.error === 'unverified';
  const failed = Boolean(params.error) && !unverified;

  const title = unverified
    ? 'Verify your email to continue'
    : failed
      ? 'That verification link did not work'
      : 'Your email is verified';

  const body = unverified
    ? 'Your account exists, but this session predates email verification. Open the verification email we sent you, then come back and sign in. If the link has expired, sign in again to request a fresh one.'
    : failed
      ? 'The link may have expired or already been used. Sign in again and we will send a fresh verification email.'
      : 'You can sign in and continue to your dashboard.';

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <header>
        <Link href="/" className="font-heading text-2xl font-semibold text-foreground">
          iskole
        </Link>
      </header>
      <main className="flex flex-1 flex-col justify-center gap-4 py-12">
        <span className="flex size-12 items-center justify-center rounded-full bg-sky-soft text-sky">
          <MailCheck className="size-6" aria-hidden="true" />
        </span>
        <h1 className="font-heading text-3xl font-semibold text-foreground">{title}</h1>
        <p className={failed ? 'leading-7 text-danger' : 'leading-7 text-muted-foreground'}>{body}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="accent">
            <Link href="/signin">Go to sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
        {unverified ? (
          <p className="mt-2 rounded-lg border border-border bg-card p-3 text-sm leading-6 text-muted-foreground">
            Local demo: verification emails are captured by Mailpit at{' '}
            <a href="http://localhost:8025" className="font-medium text-sky underline" target="_blank" rel="noreferrer">
              localhost:8025
            </a>
            . Sign in again to generate a fresh link.
          </p>
        ) : null}
      </main>
    </div>
  );
}
