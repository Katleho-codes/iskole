'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
        const [marksRes, apsRes] = await Promise.all([fetch('/api/marks'), fetch('/api/aps')]);
        if (marksRes.ok) {
          const data = (await marksRes.json()) as {
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
        if (apsRes.ok) {
          const data = (await apsRes.json()) as { aps: ApsResponse };
          if (!cancelled) setAps(data.aps);
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
    setMessage('Marks saved. Your APS is up to date.');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your marks"
        description="Add your matric subjects and marks. We calculate your APS and check course requirements. Life Orientation is excluded from the best-six score."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Subjects</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading your marks…</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3" noValidate>
                {rows.map((row, index) => (
                  <div key={index} className="rounded-lg border border-border bg-mist/40 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_auto] sm:items-end">
                      <div className="space-y-1.5">
                        <Label htmlFor={`subject-${index}`}>Subject</Label>
                        <Input
                          id={`subject-${index}`}
                          type="text"
                          maxLength={80}
                          value={row.subject}
                          onChange={(e) => updateRow(index, { subject: e.target.value })}
                          placeholder="e.g. Mathematics"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`mark-${index}`}>Mark %</Label>
                        <Input
                          id={`mark-${index}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={100}
                          value={row.mark}
                          onChange={(e) => updateRow(index, { mark: e.target.value })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(index)}
                        disabled={rows.length === 1}
                        aria-label={`Remove ${row.subject || 'subject'}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={row.isHomeLanguage}
                        onCheckedChange={(checked) =>
                          updateRow(index, { isHomeLanguage: checked === true })
                        }
                      />
                      This is my home language
                    </label>
                  </div>
                ))}

                <Button type="button" variant="outline" onClick={addRow} className="w-full border-dashed">
                  <Plus className="size-4" />
                  Add another subject
                </Button>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button type="submit" variant="accent" disabled={status === 'saving'}>
                    {status === 'saving' ? 'Saving…' : 'Save and calculate APS'}
                  </Button>
                  <Button asChild variant="link" className="px-0">
                    <Link href="/match">Next: find courses →</Link>
                  </Button>
                </div>

                {message ? (
                  <p
                    role="status"
                    aria-live="polite"
                    className={
                      status === 'success'
                        ? 'text-sm text-leaf'
                        : status === 'error'
                          ? 'text-sm text-danger'
                          : 'text-sm text-muted-foreground'
                    }
                  >
                    {message}
                  </p>
                ) : null}
              </form>
            )}
          </CardContent>
        </Card>

        <Card aria-label="Your APS result">
          <CardHeader>
            <CardTitle>APS</CardTitle>
          </CardHeader>
          <CardContent>
            {aps ? (
              <>
                <p className="tabular text-4xl font-semibold leading-none text-foreground">
                  {aps.score}
                  <span className="ml-1 text-base font-normal text-muted-foreground">
                    / {aps.maxScore}
                  </span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Based on your best six subjects. Life Orientation is not counted.
                </p>

                {aps.counted.length > 0 ? (
                  <ul className="mt-4 space-y-2 text-sm">
                    {aps.counted.map((item) => (
                      <li key={item.subject} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                        <span className="min-w-0 truncate">{item.subject}</span>
                        <span className="tabular shrink-0 text-muted-foreground">
                          {item.mark}% · {item.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No subjects counted yet. Add your marks.
                  </p>
                )}

                {aps.excluded.length > 0 ? (
                  <div className="mt-5 rounded-lg bg-mist p-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Not counted
                    </h3>
                    <ul className="mt-1.5 space-y-1 text-xs leading-5 text-muted-foreground">
                      {aps.excluded.map((item) => (
                        <li key={item.subject}>
                          {item.subject}: {EXCLUSION_LABELS[item.reason] ?? item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Add at least one mark to see your APS. The calculation is deterministic and never
                left to the AI.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
