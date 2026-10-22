'use client';

/**
 * Funding step. Lists active funding options and lets a learner compare a shortlist
 * side by side. Values come straight from the seeded FundingOption rows, which are sample
 * data: the UI labels them as such so nobody treats them as a live offer.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';

type FundingOption = {
  id: string;
  name: string;
  provider: string;
  type: string;
  description: string | null;
  eligibility: string | null;
  amountMin: number | null;
  amountMax: number | null;
  coversTuition: boolean;
  coversAccommodation: boolean;
  coversBooks: boolean;
  coversAllowance: boolean;
  deadline: string | null;
  website: string | null;
};

function formatAmount(option: FundingOption) {
  const { amountMin, amountMax } = option;
  if (amountMin && amountMax && amountMin !== amountMax) {
    return `R${amountMin.toLocaleString('en-ZA')} – R${amountMax.toLocaleString('en-ZA')}`;
  }
  if (amountMax) return `Up to R${amountMax.toLocaleString('en-ZA')}`;
  if (amountMin) return `From R${amountMin.toLocaleString('en-ZA')}`;
  return 'Amount varies';
}

function coversList(option: FundingOption) {
  const items: string[] = [];
  if (option.coversTuition) items.push('Tuition');
  if (option.coversAccommodation) items.push('Accommodation');
  if (option.coversBooks) items.push('Books');
  if (option.coversAllowance) items.push('Allowance');
  return items;
}

export default function FundingPage() {
  const [options, setOptions] = useState<FundingOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/funding');
        if (!res.ok) {
          if (!cancelled) {
            setStatus('error');
            setMessage('We could not load funding options. Try again.');
          }
          return;
        }
        const data = (await res.json()) as { fundingOptions: FundingOption[] };
        if (!cancelled) {
          setOptions(data.fundingOptions);
          setStatus('success');
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('We could not reach the server. Check your connection and try again.');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id].slice(0, 4),
    );
  }

  const comparison = options.filter((option) => selected.includes(option.id));

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
        <h1 className="font-title text-3xl text-ink-deep">Funding options</h1>
        <p className="mt-2 text-muted">
          Bursaries, scholarships and NSFAS. Pick up to four to compare what each one covers.
        </p>
        <p className="mt-2 text-xs text-muted">
          Sample data. Always check the provider&apos;s own page before you rely on an amount or
          deadline.
        </p>

        {status === 'loading' && <p className="mt-8 text-muted">Loading funding options…</p>}

        {status === 'error' && (
          <p role="status" className="mt-8 text-sm text-danger">
            {message}
          </p>
        )}

        {status === 'success' && options.length === 0 && (
          <p className="mt-8 text-muted">No funding options are available yet.</p>
        )}

        {status === 'success' && options.length > 0 && (
          <>
            <ul className="mt-8 space-y-4">
              {options.map((option) => {
                const isSelected = selected.includes(option.id);
                return (
                  <li
                    key={option.id}
                    className={`rounded-lg border bg-paper-raised p-5 ${
                      isSelected ? 'border-ink' : 'border-line'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-title text-xl text-ink-deep">{option.name}</h2>
                        <p className="text-sm text-muted">{option.provider}</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-ink-deep">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(option.id)}
                        />
                        Compare
                      </label>
                    </div>

                    <p className="mt-3 text-sm font-medium text-ink-deep">
                      {formatAmount(option)}
                    </p>

                    {option.description && (
                      <p className="mt-1 text-sm text-muted">{option.description}</p>
                    )}

                    {coversList(option).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {coversList(option).map((item) => (
                          <span
                            key={item}
                            className="rounded-full bg-ink/10 px-2 py-1 text-xs text-ink-deep"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
                      <span>{option.type.replace(/_/g, ' ')}</span>
                      {option.deadline && (
                        <span>
                          Closes{' '}
                          {new Date(option.deadline).toLocaleDateString('en-ZA', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>

                    {option.eligibility && (
                      <p className="mt-2 text-sm text-muted">
                        <span className="font-medium text-ink-deep">Who qualifies: </span>
                        {option.eligibility}
                      </p>
                    )}

                    {option.website && (
                      <a
                        href={option.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-3 inline-block text-sm text-ink underline hover:text-ink-deep"
                      >
                        Provider page
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>

            {comparison.length > 0 && (
              <section className="mt-10" aria-label="Funding comparison">
                <h2 className="font-title text-2xl text-ink-deep">
                  Comparing {comparison.length} option{comparison.length === 1 ? '' : 's'}
                </h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th scope="col" className="border border-line bg-paper-raised p-2 text-left">
                          Feature
                        </th>
                        {comparison.map((option) => (
                          <th
                            key={option.id}
                            scope="col"
                            className="border border-line bg-paper-raised p-2 text-left"
                          >
                            {option.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row" className="border border-line p-2 text-left">
                          Amount
                        </th>
                        {comparison.map((option) => (
                          <td key={option.id} className="border border-line p-2">
                            {formatAmount(option)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row" className="border border-line p-2 text-left">
                          Covers
                        </th>
                        {comparison.map((option) => (
                          <td key={option.id} className="border border-line p-2">
                            {coversList(option).join(', ') || 'Not specified'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row" className="border border-line p-2 text-left">
                          Deadline
                        </th>
                        {comparison.map((option) => (
                          <td key={option.id} className="border border-line p-2">
                            {option.deadline
                              ? new Date(option.deadline).toLocaleDateString('en-ZA')
                              : 'Not listed'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <div className="mt-8">
              <Link href="/applications" className="text-sm text-ink underline hover:text-ink-deep">
                Next: apply to a course →
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
