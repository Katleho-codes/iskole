/**
 * Sign-up form. Uses better-auth's own signUp.email method. There is no iskole sign-up
 * endpoint: /api/auth/sign-up/email is better-auth's, reached through the Next rewrite.
 *
 * Security notes:
 * - The client never sends a role. better-auth assigns the admin plugin's defaultRole
 *   (STUDENT) server-side. If a role were sent it would be ignored, but we do not send one.
 * - Email verification is currently switched off server-side (see lib/auth.ts), so a new
 *   learner gets a session immediately and goes straight into the app. When verification is
 *   re-enabled, sign-up returns the same success response whether or not the address already
 *   exists, so this screen cannot be used to find out who has an iskole account.
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
      // Where better-auth sends the learner if email verification is later re-enabled.
      // Without this they would land on the raw JSON of its verify endpoint.
      callbackURL: `${window.location.origin}/verify-email`,
      // Explicitly no role, no approved flag, nothing the client could use to escalate.
    });

    if (authError) {
      setPending(false);
      // Better-auth validates password length and breach lookups server-side too. Surface a
      // generic message rather than echoing server internals.
      setError(authError.message ?? dict.genericAuthError);
      return;
    }

    // Capture the date of birth on the profile before the dashboard. The API re-checks the
    // age; this call cannot set a role, and a failure just sends the learner to the profile
    // screen so the missing field is obvious rather than silently absent.
    const profileSaved = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateOfBirth }),
    }).catch(() => null);

    // Hard navigation so server components read the fresh session cookie on first request.
    // better-auth signs the learner in as part of sign-up while verification is off.
    window.location.assign(profileSaved?.ok ? '/dashboard' : '/profile');
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

      <label className="flex items-start gap-3 text-sm text-muted">
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
