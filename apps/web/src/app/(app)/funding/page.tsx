'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bookmark, BookmarkCheck, ExternalLink, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, EmptyState, ErrorState, SkeletonList } from '@/components/page-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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

const TYPE_LABELS: Record<string, string> = {
  GOVERNMENT_BURSARY: 'Government bursary',
  CORPORATE_BURSARY: 'Corporate bursary',
  SCHOLARSHIP: 'Scholarship',
  FELLOWSHIP: 'Fellowship',
  NSFAS: 'NSFAS',
  OTHER: 'Other',
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

function deadlineLabel(value: string | null) {
  if (!value) return 'No deadline listed';
  const date = new Date(value);
  const days = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const formatted = date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  if (days < 0) return `Closed ${formatted}`;
  if (days === 0) return `Closes today · ${formatted}`;
  if (days <= 14) return `Closes in ${days} days · ${formatted}`;
  return `Closes ${formatted}`;
}

export default function FundingPage() {
  const [options, setOptions] = useState<FundingOption[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [filter, setFilter] = useState('ALL');
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [optionsRes, savedRes] = await Promise.all([
          fetch('/api/funding'),
          fetch('/api/funding/saved'),
        ]);
        if (!optionsRes.ok || !savedRes.ok) {
          if (!cancelled) setStatus('error');
          return;
        }
        const optionsData = (await optionsRes.json()) as { fundingOptions: FundingOption[] };
        const savedData = (await savedRes.json()) as {
          savedFunding: Array<{ fundingOptionId: string }>;
        };
        if (!cancelled) {
          setOptions(optionsData.fundingOptions);
          setSaved(savedData.savedFunding.map((item) => item.fundingOptionId));
          setStatus('success');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleSaved(option: FundingOption) {
    const isSaved = saved.includes(option.id);
    if (!isSaved && saved.length >= 3) {
      toast.info('Compare up to three options', {
        description: 'Remove one before saving another.',
      });
      return;
    }

    setPendingId(option.id);
    setSaved((current) => (isSaved ? current.filter((id) => id !== option.id) : [...current, option.id]));
    try {
      const res = await fetch(`/api/funding/${option.id}/save`, {
        method: isSaved ? 'DELETE' : 'PUT',
      });
      if (!res.ok) throw new Error('save failed');
      toast.success(isSaved ? 'Removed from your shortlist' : 'Saved to your shortlist', {
        description: option.name,
      });
    } catch {
      setSaved((current) => (isSaved ? [...current, option.id] : current.filter((id) => id !== option.id)));
      toast.error('We could not save that change. Try again.');
    } finally {
      setPendingId(null);
    }
  }

  const types = useMemo(() => ['ALL', ...Array.from(new Set(options.map((option) => option.type)))], [options]);
  const visible = filter === 'ALL' ? options : options.filter((option) => option.type === filter);
  const comparison = options.filter((option) => saved.includes(option.id));

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <PageHeader title="Funding" description="Bursaries, scholarships and NSFAS. Save up to three and compare what each one covers." />
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title="Funding" />
        <ErrorState title="Funding did not load" retryHref="/funding" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funding"
        description="Bursaries, scholarships and NSFAS. Save up to three and compare what each one covers. Sample data: always confirm on the provider's page."
        action={
          <Badge variant="sky" className="h-7 px-3">
            <Wallet className="size-3.5" />
            {saved.length}/3 saved
          </Badge>
        }
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter funding by type">
        {types.map((type) => (
          <Button
            key={type}
            type="button"
            size="sm"
            variant={filter === type ? 'default' : 'outline'}
            onClick={() => setFilter(type)}
          >
            {type === 'ALL' ? 'All options' : (TYPE_LABELS[type] ?? type.replaceAll('_', ' '))}
          </Button>
        ))}
      </div>

      {comparison.length > 0 ? (
        <Card>
          <CardContent className="pt-1">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Comparing {comparison.length}</h2>
              <Button size="sm" variant="ghost" onClick={() => comparison.forEach((option) => void toggleSaved(option))}>
                Clear
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-border p-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Feature
                    </th>
                    {comparison.map((option) => (
                      <th key={option.id} scope="col" className="border-b border-border p-2 text-left font-medium">
                        {option.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="border-b border-border p-2 text-left text-muted-foreground">Amount</th>
                    {comparison.map((option) => (
                      <td key={option.id} className="border-b border-border p-2">{formatAmount(option)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className="border-b border-border p-2 text-left text-muted-foreground">Covers</th>
                    {comparison.map((option) => (
                      <td key={option.id} className="border-b border-border p-2">{coversList(option).join(', ') || 'Not specified'}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className="p-2 text-left text-muted-foreground">Deadline</th>
                    {comparison.map((option) => (
                      <td key={option.id} className="p-2">
                        {option.deadline ? new Date(option.deadline).toLocaleDateString('en-ZA') : 'Not listed'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState illustration="funding" title="No options in this filter" body="Try another type or clear the filters." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {visible.map((option) => {
            const isSaved = saved.includes(option.id);
            const covers = coversList(option);
            return (
              <li key={option.id}>
                <Card className={`h-full ${isSaved ? 'border-navy' : ''}`}>
                  <CardContent className="flex h-full flex-col pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Badge variant="neutral">{TYPE_LABELS[option.type] ?? option.type.replaceAll('_', ' ')}</Badge>
                        <h2 className="mt-2 text-lg font-semibold leading-tight">{option.name}</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">{option.provider}</p>
                      </div>
                      <Button
                        type="button"
                        variant={isSaved ? 'secondary' : 'outline'}
                        size="icon"
                        onClick={() => void toggleSaved(option)}
                        disabled={pendingId === option.id}
                        aria-label={isSaved ? `Remove ${option.name} from shortlist` : `Save ${option.name}`}
                        aria-pressed={isSaved}
                      >
                        {isSaved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                      </Button>
                    </div>

                    <p className="tabular mt-4 text-xl font-semibold">{formatAmount(option)}</p>

                    {option.description ? (
                      <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">{option.description}</p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {covers.length > 0 ? (
                        covers.map((item) => <Badge key={item} variant="leaf">{item}</Badge>)
                      ) : (
                        <Badge variant="neutral">Coverage not listed</Badge>
                      )}
                    </div>

                    <p className="mt-auto pt-4 text-xs font-medium text-muted-foreground">{deadlineLabel(option.deadline)}</p>

                    {option.website ? (
                      <a
                        href={option.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-sky hover:underline"
                      >
                        Provider page
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs leading-5 text-muted-foreground">
          Sample funding data. Confirm amounts and deadlines with the provider before relying on them.
        </p>
        <Button asChild variant="link" className="px-0">
          <Link href="/match">Next: find a course →</Link>
        </Button>
      </div>
    </div>
  );
}
