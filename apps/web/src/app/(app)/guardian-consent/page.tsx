'use client';

/**
 * Guardian consent for 16- and 17-year-olds.
 *
 * The API decides whether consent is required from the date of birth on the profile. This
 * screen only collects the guardian's name and contact, and an explicit confirmation. It
 * cannot turn a learner into an adult, and it cannot make an under-18 visible to companies:
 * that remains blocked by the server.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';

type ConsentStatus = {
  required: boolean;
  age: number | null;
  hasDateOfBirth: boolean;
  consent: {
    guardianName: string;
    guardianContact: string;
    confirmedAt: string;
  } | null;
};

export default function GuardianConsentPage() {
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guardianName, setGuardianName] = useState('');
  const [guardianContact, setGuardianContact] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/privacy/guardian-consent');
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(
              res.status === 401
                ? 'Please sign in again to continue.'
                : 'We could not load your guardian consent details.',
            );
          }
          return;
        }
        const data = (await res.json()) as { guardianConsent: ConsentStatus };
        if (cancelled) return;
        setStatus(data.guardianConsent);
        if (data.guardianConsent.consent) {
          setGuardianName(data.guardianConsent.consent.guardianName);
          setGuardianContact(data.guardianConsent.consent.guardianContact);
        }
      } catch {
        if (!cancelled) setLoadError('Check your connection and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!confirmed) {
      setError('Please confirm that your parent or guardian agrees.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/privacy/guardian-consent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardianName, guardianContact, confirmed: true }),
      });

      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as
          | { error?: string; issues?: Array<{ path?: string[]; message?: string }> }
          | null;
        const firstIssue = detail?.issues?.[0];
        setError(
          firstIssue?.message ?? detail?.error ?? 'We could not save the guardian consent.',
        );
        return;
      }

      const data = (await res.json()) as { guardianConsent: ConsentStatus };
      setStatus((current) =>
        current
          ? { ...current, consent: data.guardianConsent.consent }
          : { ...data.guardianConsent, hasDateOfBirth: true },
      );
      setMessage('Guardian consent recorded. You can now submit applications.');
    } catch {
      setError('We could not save the guardian consent. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="font-title text-xl text-ink-deep">
          iskole
        </Link>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-ink-deep">
          Back to dashboard
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="font-title text-3xl text-ink-deep">Guardian consent</h1>
        <p className="mt-2 text-muted-foreground">
          Under South African privacy law, a parent or guardian must agree before a learner
          under 18 submits an application.
        </p>

        {loading ? (
          <p className="mt-8 text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <p className="mt-8 text-danger">{loadError}</p>
        ) : status && !status.hasDateOfBirth ? (
          <section className="mt-8 rounded-lg border border-line bg-paper-raised p-5">
            <h2 className="font-title text-xl text-ink-deep">Add your date of birth first</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We need your date of birth to know whether guardian consent applies.
            </p>
            <Link
              href="/profile"
              className="mt-3 inline-block rounded-md bg-ink px-5 py-2 text-sm text-white hover:bg-ink-deep"
            >
              Go to your profile
            </Link>
          </section>
        ) : status && !status.required ? (
          <section className="mt-8 rounded-lg border border-line bg-paper-raised p-5">
            <h2 className="font-title text-xl text-ink-deep">Not required</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You are 18 or older, so you can consent for yourself. This page is only needed
              for learners aged 16 or 17.
            </p>
          </section>
        ) : status ? (
          <section className="mt-8 rounded-lg border border-line bg-paper-raised p-5">
            {status.consent ? (
              <div className="mb-5 rounded-md border border-line bg-paper px-4 py-3 text-sm">
                <p className="font-medium text-ink-deep">Consent recorded</p>
                <p className="mt-1 text-muted-foreground">
                  Guardian: {status.consent.guardianName}. Recorded on{' '}
                  {new Date(status.consent.confirmedAt).toLocaleDateString('en-ZA')}. You can
                  update the details below.
                </p>
              </div>
            ) : (
              <p className="mb-5 text-sm text-muted-foreground">
                Ask your parent or guardian to read this page with you. Enter their details and
                confirm that they agree.
              </p>
            )}

            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="guardianName"
                  className="mb-1 block text-sm font-medium text-ink-deep"
                >
                  Guardian's full name
                </label>
                <input
                  id="guardianName"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={120}
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  className="w-full rounded-md border border-line px-3 py-2"
                />
              </div>

              <div>
                <label
                  htmlFor="guardianContact"
                  className="mb-1 block text-sm font-medium text-ink-deep"
                >
                  Guardian's phone or email
                </label>
                <input
                  id="guardianContact"
                  type="text"
                  required
                  maxLength={160}
                  value={guardianContact}
                  onChange={(e) => setGuardianContact(e.target.value)}
                  className="w-full rounded-md border border-line px-3 py-2"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Used only to keep a record of who consented. It is included in your data
                  export and deleted with your account.
                </p>
              </div>

              <label className="flex items-start gap-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-line"
                />
                <span>
                  I confirm that my parent or guardian has read the privacy notice and agrees
                  to iskole processing my information so I can apply to courses and funding.
                </span>
              </label>

              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p role="status" aria-live="polite" className="text-sm text-ink">
                  {message}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-ink px-6 py-2 text-white hover:bg-ink-deep disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Record guardian consent'}
              </button>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}
