/**
 * Sign-in form. Uses better-auth's signIn.email. No iskole sign-in endpoint exists.
 *
 * Security notes:
 * - The error shown is always the same generic string. Distinguishing "no such user" from
 *   "wrong password" would let someone enumerate which addresses have accounts.
 * - better-auth rate-limits /sign-in/email to 5 attempts per minute (see lib/auth.ts).
 * - On success we do a full navigation, not a client-side one, so the server-rendered
 *   pages pick up the new session cookie on their first request.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '../lib/auth-client';
import { getDict } from '../i18n/strings';
import { Field, FormError, SubmitButton, TextInput } from './form';

const dict = getDict('en');

export function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: authError } = await authClient.signIn.email({ email, password });
    setPending(false);

    if (authError) {
      setError(dict.genericAuthError);
      return;
    }

    // Straight to the journey, not the marketing page: a signed-in learner has nothing to
    // do on the landing screen and no link from it into the app.
    window.location.assign('/dashboard');
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <h1 className="font-title text-3xl text-ink-deep">{dict.signInTitle}</h1>

      <Field id="email" label={dict.emailLabel}>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field id="password" label={dict.passwordLabel}>
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <FormError message={error} />
      <SubmitButton pending={pending} pendingLabel={dict.submitSignIn}>
        {dict.submitSignIn}
      </SubmitButton>

      <div className="flex flex-col gap-2 text-center text-sm">
        <Link href="/reset-password" className="font-medium text-ink underline underline-offset-4">
          {dict.resetTitle}
        </Link>
        <Link href="/signup" className="text-muted underline underline-offset-4">
          {dict.signUpPrompt}
        </Link>
      </div>
    </form>
  );
}
