'use client';

/**
 * Study plan step. This is the "keep going" part of the journey: the learner gets a weekly
 * plan after applying, approves it, and can add it to a calendar.
 *
 * The plan is generated from marks and study preferences only. The API falls back to a
 * deterministic plan when the model is unavailable, so this screen always has something
 * usable. Calendar export is offered only after approval because the learner should read
 * the plan before it lands in their week.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';

type PlanBlock = {
  day: string;
  task: string;
  startTime?: string;
  durationMinutes?: number;
};

type StudyPlan = {
  id: string;
  title: string;
  approved: boolean;
  blocks: PlanBlock[];
  createdAt: string;
};

const DAY_ORDER = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dayLabel(day: string) {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

function orderedBlocks(blocks: PlanBlock[]) {
  return [...blocks].sort((a, b) => {
    const dayDelta = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    if (dayDelta !== 0) return dayDelta;
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });
}

export default function StudyPlanPage() {
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  // Reused while a request is retried, replaced after a successful generation so the next
  // deliberate "build another plan" is a new request rather than a replay.
  const [requestKey, setRequestKey] = useState(newIdempotencyKey);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/study-plans');
        if (!res.ok) {
          if (!cancelled) {
            setStatus('error');
            setMessage('We could not load your study plans. Try again.');
          }
          return;
        }
        const data = (await res.json()) as { studyPlans: StudyPlan[] };
        if (!cancelled) setPlans(data.studyPlans);
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('We could not reach the server. Check your connection and try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function generatePlan() {
    setBusy('generate');
    setStatus('idle');
    setMessage('');

    try {
      const res = await fetch('/api/study-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey,
        },
        body: '{}',
      });

      if (!res.ok) {
        setStatus('error');
        setMessage(
          res.status === 401
            ? 'Please sign in again to build a plan.'
            : 'We could not build a plan just now. Try again.',
        );
        return;
      }

      const data = (await res.json()) as { studyPlan: StudyPlan };
      setPlans((current) => [data.studyPlan, ...current]);
      setRequestKey(newIdempotencyKey());
      setStatus('success');
      setMessage('Plan ready. Read it, then approve it to add it to your calendar.');
    } catch {
      setStatus('error');
      setMessage('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function approvePlan(id: string) {
    setBusy(id);
    setStatus('idle');
    setMessage('');

    try {
      const res = await fetch(`/api/study-plans/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (!res.ok) {
        setStatus('error');
        setMessage(
          res.status === 401
            ? 'Please sign in again to approve this plan.'
            : 'We could not approve that plan. Reload and try again.',
        );
        return;
      }

      setPlans((current) =>
        current.map((plan) => (plan.id === id ? { ...plan, approved: true } : plan)),
      );
      setStatus('success');
      setMessage('Plan approved. You can download it to your calendar now.');
    } catch {
      setStatus('error');
      setMessage('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
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

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-title text-3xl text-ink-deep">Your study plan</h1>
        <p className="mt-2 text-muted">
          A realistic week built from your subjects and marks. Short blocks, spread across the
          week, starting with the subjects that need the most practice.
        </p>
        <p className="mt-2 text-xs text-muted">
          AI-assisted when available, with a deterministic plan as a fallback. You approve it
          before it appears on your calendar.
        </p>

        <p
          role="status"
          aria-live="polite"
          className={
            status === 'success'
              ? 'mt-4 text-sm text-ink'
              : status === 'error'
                ? 'mt-4 text-sm text-danger'
                : 'sr-only'
          }
        >
          {message}
        </p>

        {loading ? (
          <p className="mt-8 text-muted">Loading your plans…</p>
        ) : (
          <>
            <section className="mt-8 rounded-lg border border-line bg-paper-raised p-5">
              <h2 className="font-title text-xl text-ink-deep">Build a plan</h2>
              <p className="mt-2 text-sm text-muted">
                Use your current marks and preferences. You can build a fresh plan after
                changing your marks.
              </p>
              <button
                type="button"
                onClick={generatePlan}
                disabled={busy === 'generate'}
                className="mt-4 rounded-md bg-ink px-5 py-2 text-sm text-paper hover:bg-ink-deep disabled:opacity-50"
              >
                {busy === 'generate' ? 'Building your plan…' : 'Build my study plan'}
              </button>
              {busy === 'generate' && (
                <p className="mt-2 text-xs text-muted">
                  This can take a few seconds. If the assistant is unavailable, we use a
                  deterministic plan instead.
                </p>
              )}
            </section>

            <section className="mt-8" aria-label="Your plans">
              <h2 className="font-title text-xl text-ink-deep">Your plans</h2>

              {plans.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  No plan yet. Build one above, then approve it to download a calendar file.
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {plans.map((plan) => (
                    <li
                      key={plan.id}
                      className="rounded-lg border border-line bg-paper-raised p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-title text-lg text-ink-deep">{plan.title}</h3>
                          <p className="text-xs text-muted">
                            Built{' '}
                            {new Date(plan.createdAt).toLocaleDateString('en-ZA', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            plan.approved
                              ? 'bg-ink/15 text-ink-deep'
                              : 'border border-line bg-paper text-muted'
                          }`}
                        >
                          {plan.approved ? 'Approved' : 'Not approved'}
                        </span>
                      </div>

                      <ol className="mt-4 space-y-2">
                        {orderedBlocks(plan.blocks).map((block, index) => (
                          <li
                            key={`${plan.id}-${block.day}-${block.task}-${index}`}
                            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-line pl-3"
                          >
                            <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
                              {dayLabel(block.day)}
                            </span>
                            <span className="min-w-0 flex-1 text-sm text-ink-deep">
                              {block.task}
                            </span>
                            <span className="text-xs text-muted">
                              {block.startTime ?? '17:00'}
                              {block.durationMinutes ? ` · ${block.durationMinutes} min` : ''}
                            </span>
                          </li>
                        ))}
                      </ol>

                      <div className="mt-4 flex flex-wrap items-center gap-4">
                        {!plan.approved && (
                          <button
                            type="button"
                            onClick={() => approvePlan(plan.id)}
                            disabled={busy === plan.id}
                            className="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-ink-deep disabled:opacity-50"
                          >
                            {busy === plan.id ? 'Approving…' : 'Approve this plan'}
                          </button>
                        )}
                        {plan.approved && (
                          <a
                            href={`/api/study-plans/${plan.id}/calendar.ics`}
                            className="text-sm text-ink underline hover:text-ink-deep"
                          >
                            Download calendar file (.ics)
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
