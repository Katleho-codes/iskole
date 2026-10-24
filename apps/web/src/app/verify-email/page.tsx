/**
 * Email verification landing page.
 *
 * better-auth sends the learner to /api/auth/verify-email?token=... (its own endpoint).
 * That endpoint returns JSON, so the verification email sets callbackURL to this page
 * (see sign-up-form: authClient.signUp.email callbackURL, and the requestVerificationEmail
 * call on /signin). better-auth appends the outcome as ?error=... when verification fails.
 *
 * This page therefore only reads the outcome: it never verifies anything itself and there
 * is no iskole verify endpoint.
 */
import Link from 'next/link';
import { getDict } from '../../i18n/strings';

const dict = getDict('en');

type SearchParams = Promise<{ error?: string }>;

export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const failed = Boolean(params.error);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <header>
        <Link href="/" className="font-title text-2xl font-semibold text-ink">
          {dict.brand}
        </Link>
      </header>
      <main className="flex flex-1 flex-col justify-center gap-4 py-12">
        <h1 className="font-title text-3xl text-ink-deep">{dict.verifyTitle}</h1>
        <p className={failed ? 'text-danger' : 'text-muted'}>
          {failed ? dict.verifyFailed : dict.verifySuccess}
        </p>
        <Link href="/signin" className="font-medium text-ink underline underline-offset-4">
          {dict.signIn}
        </Link>
      </main>
    </div>
  );
}
