'use client';

/**
 * Match step. The API does the filtering deterministically (APS, required subjects,
 * province, budget) and then optionally asks the AI to explain the shortlist. If the AI is
 * unavailable the same list comes back with deterministic reasons, so this screen has no
 * "AI is down" state to handle.
 */
import { useState } from 'react';
import Link from 'next/link';

type Recommendation = {
  course: {
    id: string;
    name: string;
    code: string | null;
    field: string;
    qualification: string | null;
    apsMin: number;
    institution: { name: string; province: string; type: string };
  };
  score: number;
  why: string;
  improvements: string[];
  aiEnhanced: boolean;
};

type MatchResponse = {
  aps: { score: number; maxScore: number };
  recommendations: Recommendation[];
  filtered: { total: number; eligible: number; affordable: number };
};

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function MatchPage() {
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function findMatches() {
    setStatus('loading');
    setMessage('');
    setResult(null);

    try {
      const res = await fetch('/api/match', { method: 'POST' });
      if (!res.ok) {
        setStatus('error');
        setMessage(
          res.status === 401
            ? 'Please sign in again to see matches.'
            : res.status === 403
              ? 'Only learner accounts can request course matches.'
              : 'We could not work out your matches. Try again.',
        );
        return;
      }

      const data = (await res.json()) as MatchResponse;
      setResult(data);
      setStatus('success');
    } catch {
      setStatus('error');
      setMessage('We could not reach the server. Check your connection and try again.');
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="font-title text-xl text-ink-deep">
          iskole
        </Link>
        <Link href="/dashboard" className="text-sm text-muted hover:text-ink-deep">
          Back to dashboard
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="font-title text-3xl text-ink-deep">Course matches</h1>
        <p className="mt-2 text-muted">
          We filter by your APS, subjects, province and budget first, then explain the
          shortlist in plain language.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={findMatches}
            disabled={status === 'loading'}
            className="rounded-md bg-ink px-6 py-2 text-white hover:bg-ink-deep disabled:opacity-50"
          >
            {status === 'loading' ? 'Finding matches…' : 'Find matching courses'}
          </button>
          <Link href="/marks" className="text-sm text-ink underline hover:text-ink-deep">
            Update your marks
          </Link>
        </div>

        <p
          role="status"
          aria-live="polite"
          className={status === 'error' ? 'mt-4 text-sm text-danger' : 'sr-only'}
        >
          {message}
        </p>

        {status === 'success' && result && (
          <>
            <p className="mt-6 text-sm text-muted">
              Your APS: {result.aps.score} of {result.aps.maxScore}. We checked{' '}
              {result.filtered.total} courses; {result.filtered.eligible} met the entry
              requirements and {result.filtered.affordable} also fit your budget.
            </p>

            {result.recommendations.length === 0 ? (
              <div className="mt-6 rounded-lg border border-line bg-paper-raised p-5">
                <h2 className="font-title text-xl text-ink-deep">No matches yet</h2>
                <p className="mt-2 text-sm text-muted">
                  That usually means your APS is still below the entry bar, or your province
                  and subject preferences are narrow. Add or improve your marks, or widen
                  your preferences, then try again.
                </p>
                <div className="mt-4 flex gap-4 text-sm">
                  <Link href="/marks" className="text-ink underline hover:text-ink-deep">
                    Update marks
                  </Link>
                  <Link href="/profile" className="text-ink underline hover:text-ink-deep">
                    Update profile
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="mt-6 space-y-4">
                {result.recommendations.map((item) => (
                  <li
                    key={item.course.id}
                    className="rounded-lg border border-line bg-paper-raised p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-title text-xl text-ink-deep">{item.course.name}</h2>
                        <p className="text-sm text-muted">
                          {item.course.institution.name} ·{' '}
                          {titleCase(item.course.institution.province)} ·{' '}
                          {titleCase(item.course.field)}
                        </p>
                      </div>
                      <span className="rounded-full bg-ink/10 px-3 py-1 text-sm font-medium text-ink-deep">
                        {item.score}% fit
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-ink-deep">{item.why}</p>

                    {item.improvements.length > 0 && (
                      <div className="mt-3">
                        <h3 className="text-sm font-medium text-ink-deep">How to improve your chances</h3>
                        <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-muted">
                          {item.improvements.map((improvement) => (
                            <li key={improvement}>{improvement}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                      <span className="text-muted">Needs APS {item.course.apsMin}</span>
                      <Link
                        href={`/applications?courseId=${encodeURIComponent(item.course.id)}`}
                        className="text-ink underline hover:text-ink-deep"
                      >
                        Apply to this course →
                      </Link>
                      <Link href="/funding" className="text-ink underline hover:text-ink-deep">
                        Check funding
                      </Link>
                    </div>

                    {!item.aiEnhanced && (
                      <p className="mt-2 text-xs text-muted">
                        Explanation generated from your marks and the course rules.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
