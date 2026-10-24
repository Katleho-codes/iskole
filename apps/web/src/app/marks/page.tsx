'use client';

/**
 * Marks step of the guided journey.
 *
 * Each mark is saved with an Idempotency-Key so a double tap on a slow connection creates
 * one subject mark, not two. The API also upserts on (userId, subject), so re-saving a
 * corrected mark updates the row instead of duplicating it.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';

type MarkRow = { id?: string; subject: string; mark: string; isHomeLanguage: boolean };

type ApsCounted = { subject: string; mark: number; points: number };
type ApsExcluded = { subject: string; reason: string };

type ApsResponse = {
  score: number;
  maxScore: number;
  counted: ApsCounted[];
  excluded: ApsExcluded[];
  ruleApplied: Record<string, unknown>;
};

const EMPTY_ROW: MarkRow = { subject: '', mark: '', isHomeLanguage: false };

const EXCLUSION_LABELS: Record<string, string> = {
  LIFE_ORIENTATION: 'Life Orientation is not counted',
  HOME_LANGUAGE: 'Home language excluded by the rule in use',
  NOT_BEST: 'Not among your best subjects',
  NO_MARK: 'No mark entered',
};

export default function MarksPage() {
  const [rows, setRows] = useState<MarkRow[]>([{ ...EMPTY_ROW }]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [aps, setAps] = useState<ApsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/marks');
        if (res.ok) {
          const data = (await res.json()) as {
            marks: Array<{ id: string; subject: string; mark: number; isHomeLanguage: boolean }>;
          };
          if (cancelled) return;
          if (data.marks.length > 0) {
            setRows(
              data.marks.map((m) => ({
                id: m.id,
                subject: m.subject,
                mark: String(m.mark),
                isHomeLanguage: m.isHomeLanguage,
              })),
            );
          }
        }
      } catch {
        // An empty form is a fine starting point; saving will surface a real error.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateRow(index: number, patch: Partial<MarkRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { ...EMPTY_ROW }]);
  }

  function removeRow(index: number) {
    setRows((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');
    setAps(null);

    const filled = rows.filter((row) => row.subject.trim() && row.mark !== '');
    if (filled.length === 0) {
      setStatus('error');
      setMessage('Add at least one subject and mark.');
      return;
    }

    for (const [index, row] of filled.entries()) {
      const mark = Number(row.mark);
      if (!Number.isFinite(mark) || mark < 0 || mark > 100) {
        setStatus('error');
        setMessage(`Enter a mark between 0 and 100 for ${row.subject.trim()}.`);
        return;
      }

      const res = await fetch('/api/marks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Stable per row and attempt: a retry of this save replays instead of duplicating.
          'Idempotency-Key': `mark-${row.subject.trim().toLowerCase()}-${mark}-${index}`,
        },
        body: JSON.stringify({
          subject: row.subject.trim(),
          mark,
          isHomeLanguage: row.isHomeLanguage,
        }),
      }).catch(() => null);

      if (!res || !res.ok) {
        setStatus('error');
        setMessage(
          res?.status === 401
            ? 'Please sign in again to save your marks.'
            : `We could not save ${row.subject.trim()}. Check your connection and try again.`,
        );
        return;
      }
    }

    const apsRes = await fetch('/api/aps').catch(() => null);
    if (!apsRes || !apsRes.ok) {
      setStatus('error');
      setMessage('Marks saved, but we could not calculate your APS. Reload the page to try again.');
      return;
    }

    const apsData = (await apsRes.json()) as { aps: ApsResponse };
    setAps(apsData.aps);
    setStatus('success');
    setMessage('Marks saved. Your APS is below.');
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
        <h1 className="font-title text-3xl text-ink-deep">Your marks</h1>
        <p className="mt-2 text-muted">
          Add your matric subjects and marks. We use them to calculate your APS and check
          course requirements.
        </p>

        {loading ? (
          <p className="mt-8 text-muted">Loading your marks…</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-paper-raised p-4 sm:grid-cols-[1fr_7rem_auto_auto] sm:items-end">
                <div>
                  <label
                    htmlFor={`subject-${index}`}
                    className="mb-1 block text-sm font-medium text-ink-deep"
                  >
                    Subject
                  </label>
                  <input
                    id={`subject-${index}`}
                    type="text"
                    maxLength={80}
                    value={row.subject}
                    onChange={(e) => updateRow(index, { subject: e.target.value })}
                    className="w-full rounded-md border border-line px-3 py-2"
                    placeholder="e.g. Mathematics"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`mark-${index}`}
                    className="mb-1 block text-sm font-medium text-ink-deep"
                  >
                    Mark %
                  </label>
                  <input
                    id={`mark-${index}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={row.mark}
                    onChange={(e) => updateRow(index, { mark: e.target.value })}
                    className="w-full rounded-md border border-line px-3 py-2"
                  />
                </div>

                <label className="flex items-center gap-2 pb-2 text-sm text-ink-deep">
                  <input
                    type="checkbox"
                    checked={row.isHomeLanguage}
                    onChange={(e) => updateRow(index, { isHomeLanguage: e.target.checked })}
                  />
                  Home language
                </label>

                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  disabled={rows.length === 1}
                  className="pb-2 text-sm text-muted hover:text-ink-deep disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}

            <button type="button" onClick={addRow} className="text-sm text-ink underline hover:text-ink-deep">
              + Add another subject
            </button>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={status === 'saving'}
                className="rounded-md bg-ink px-6 py-2 text-white hover:bg-ink-deep disabled:opacity-50"
              >
                {status === 'saving' ? 'Saving…' : 'Save and calculate APS'}
              </button>
              <Link href="/match" className="text-sm text-ink underline hover:text-ink-deep">
                Next: find courses →
              </Link>
            </div>

            <p
              role="status"
              aria-live="polite"
              className={
                status === 'success'
                  ? 'text-sm text-ink'
                  : status === 'error'
                    ? 'text-sm text-danger'
                    : 'sr-only'
              }
            >
              {message}
            </p>
          </form>
        )}

        {aps && (
          <section className="mt-8 rounded-lg border border-line bg-paper-raised p-5" aria-label="Your APS result">
            <h2 className="font-title text-2xl text-ink-deep">
              Your APS: {aps.score} of {aps.maxScore}
            </h2>

            {aps.counted.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-ink-deep">
                {aps.counted.map((item) => (
                  <li key={item.subject}>
                    {item.subject}: {item.mark}% → {item.points} point
                    {item.points === 1 ? '' : 's'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">
                No subjects counted yet. Add your marks above.
              </p>
            )}

            {aps.excluded.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-ink-deep">Not counted</h3>
                <ul className="mt-1 space-y-1 text-sm text-muted">
                  {aps.excluded.map((item) => (
                    <li key={item.subject}>
                      {item.subject}: {EXCLUSION_LABELS[item.reason] ?? item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
