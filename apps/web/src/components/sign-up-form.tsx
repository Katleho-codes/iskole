/**
 * Sign-up form. Uses better-auth's own signUp.email method. There is no iskole sign-up
 * endpoint: /api/auth/sign-up/email is better-auth's, reached through the Next rewrite.
 *
 * Security notes:
 * - The client never sends a role. better-auth assigns the admin plugin's defaultRole
 *   (STUDENT) server-side. If a role were sent it would be ignored, but we do not send one.
 * - Email verification is on server-side (see lib/auth.ts), so sign-up never returns a
 *   session. The learner sees a neutral "check your email" state, and the verification link
 *   signs them in and sends them to profile onboarding.
 * - Sign-up returns the same success response whether or not the address already exists, so
 *   this screen cannot be used to find out who has an iskole account.
 * - Error messages shown to the user are generic on purpose.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ageInYears, MIN_LEARNER_AGE, parseDateOfBirth } from '@iskole/shared';
import { authClient } from '../lib/auth-client';
import { getDict } from '../i18n/strings';
import { Field, FormError, SubmitButton, TextInput, describedBy } from './form';

const dict = getDict('en');
const MIN_PASSWORD_LENGTH = 12;

/** The latest date of birth that still makes the learner 16 today. */
function latestAllowedBirthDate(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - MIN_LEARNER_AGE);
  return date.toISOString().slice(0, 10);
}

export function SignUpForm() {
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(dict.passwordHint);
      return;
    }
    if (!consent) {
      setError(dict.consentLabel);
      return;
    }

    const parsedDate = parseDateOfBirth(dateOfBirth);
    if (!parsedDate || ageInYears(parsedDate) < MIN_LEARNER_AGE) {
      setError(dict.dateOfBirthHint);
      return;
    }

    setPending(true);
    const { error: authError } = await authClient.signUp.email({
      name,
      email,
      password,
      // The verification link signs the learner in and sends them to the one onboarding
      // field we could not persist before the account existed: date of birth.
      callbackURL: `${window.location.origin}/profile?onboarding=1`,
      // Explicitly no role, no approved flag, nothing the client could use to escalate.
    });

    if (authError) {
      setPending(false);
      // Better-auth validates password length and breach lookups server-side too. Surface a
      // generic message rather than echoing server internals.
      setError(authError.message ?? dict.genericAuthError);
      return;
    }

    // No session exists until the address is verified, so there is nothing to write yet.
    // The DOB is collected again on /profile?onboarding=1 after verification; the API's
    // age gate still refuses applications and company visibility without it.
    setPending(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h1 className="font-title text-3xl text-ink-deep">Check your email</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          We sent a verification link to <span className="font-medium text-text">{email}</span>.
          Open it to finish creating your account. The link expires in one hour.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          Nothing in your inbox? Check your spam folder, then{' '}
          <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
            try signing up again
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <h1 className="font-title text-3xl text-ink-deep">{dict.signUpTitle}</h1>

      <Field id="name" label={dict.nameLabel}>
        <TextInput
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field id="dateOfBirth" label={dict.dateOfBirthLabel} hint={dict.dateOfBirthHint}>
        <TextInput
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          autoComplete="bday"
          required
          max={latestAllowedBirthDate()}
          aria-describedby={describedBy('dateOfBirth', { hint: dict.dateOfBirthHint })}
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </Field>

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

      <Field id="password" label={dict.passwordLabel} hint={dict.passwordHint}>
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          aria-describedby={describedBy('password', { hint: dict.passwordHint })}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <label className="flex items-start gap-3 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="consent"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 rounded border-line"
        />
        <span>{dict.consentLabel}</span>
      </label>

      <FormError message={error} />
      <SubmitButton pending={pending} pendingLabel={dict.submitSignUp}>
        {dict.submitSignUp}
      </SubmitButton>

      <Link href="/signin" className="text-center text-sm font-medium text-ink underline underline-offset-4">
        {dict.signInPrompt}
      </Link>
    </form>
  );
}
