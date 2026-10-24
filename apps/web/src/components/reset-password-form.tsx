/**
 * Password-reset request and completion, on one screen with two states.
 *
 * Uses better-auth's requestPasswordReset and resetPassword only. There is no iskole
 * reset endpoint.
 *
 * Security notes:
 * - The request state always shows the same confirmation, whether or not the address has
 *   an account (better-auth does the same server-side). This blocks enumeration.
 * - The reset email directs the learner back to this same page with ?token=..., which is
 *   the resetPassword token. The token is read from the URL and never stored.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authClient } from '../lib/auth-client';
import { getDict } from '../i18n/strings';
import { Field, FormError, SubmitButton, TextInput } from './form';

const dict = getDict('en');
const MIN_PASSWORD_LENGTH = 12;

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [reset, setReset] = useState(false);

  async function onRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: authError } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    if (authError) {
      // Still show the neutral confirmation: a failure here must not reveal anything.
      setRequested(true);
      return;
    }
    setRequested(true);
  }

  async function onReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError(dict.verifyFailed);
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(dict.passwordHint);
      return;
    }
    setPending(true);
    const { error: authError } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (authError) {
      setError(dict.genericAuthError);
      return;
    }
    setReset(true);
  }

  if (reset) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-title text-3xl text-ink-deep">{dict.signInTitle}</h1>
        <p className="text-muted">{dict.verifySuccess}</p>
        <Link href="/signin" className="font-medium text-ink underline underline-offset-4">
          {dict.signIn}
        </Link>
      </div>
    );
  }

  // Reset-token state: the learner clicked the link in the email.
  if (token) {
    return (
      <form onSubmit={onReset} className="flex flex-col gap-5" noValidate>
        <h1 className="font-title text-3xl text-ink-deep">{dict.resetTitle}</h1>
        <Field id="password" label={dict.newPasswordLabel} hint={dict.passwordHint}>
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        <SubmitButton pending={pending} pendingLabel={dict.resetSubmitNew}>
          {dict.resetSubmitNew}
        </SubmitButton>
      </form>
    );
  }

  // Request state.
  if (requested) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-title text-3xl text-ink-deep">{dict.resetDoneTitle}</h1>
        <p className="text-muted">{dict.resetDoneBody}</p>
        <Link href="/signin" className="font-medium text-ink underline underline-offset-4">
          {dict.signIn}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onRequest} className="flex flex-col gap-5" noValidate>
      <h1 className="font-title text-3xl text-ink-deep">{dict.resetTitle}</h1>
      <p className="text-muted">{dict.resetRequestBody}</p>
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
      <FormError message={error} />
      <SubmitButton pending={pending} pendingLabel={dict.resetSubmit}>
        {dict.resetSubmit}
      </SubmitButton>
    </form>
  );
}
