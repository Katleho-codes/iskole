'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, FileText } from 'lucide-react';
import { PageHeader, EmptyState, ErrorState, SkeletonList, StatusBadge } from '@/components/page-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Offer = {
  id: string;
  filename: string;
  sentAt: string;
  application: {
    id: string;
    status: string;
    courseId: string;
    course?: { name: string; institution?: { name: string } };
  };
};

function dateLabel(value: string) {
  return new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    const res = await fetch('/api/offers');
    if (!res.ok) throw new Error('offers');
    const data = (await res.json()) as { offers: Offer[] };
    setOffers(data.offers);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        await load();
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function download(id: string) {
    setBusy(id);
    setMessage('');
    try {
      const res = await fetch(`/api/offers/${id}/url`);
      if (!res.ok) throw new Error('url');
      const data = (await res.json()) as { download: { url: string } };
      window.location.assign(data.download.url);
    } catch {
      setMessage('We could not download that offer. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function respond(id: string, decision: 'ACCEPT' | 'DECLINE') {
    setBusy(id);
    setMessage('');
    try {
      const res = await fetch(`/api/offers/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `offer-${id}-${decision}` },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error('respond');
      await load();
      setMessage(decision === 'ACCEPT' ? 'Offer accepted.' : 'Offer declined.');
    } catch {
      setMessage('We could not respond to this offer. Try again.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Offers" description="View offers, download the letter and respond in one place." />
        <SkeletonList rows={2} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Offers" />
        <ErrorState title="Offers did not load" retryHref="/offers" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offers"
        description="View offers, download the letter and respond in one place. These are simulated offers for the demo."
      />

      {offers.length === 0 ? (
        <EmptyState
          illustration="applications"
          title="No offers yet"
          body="When an institution or company issues an offer, it will show up here with an accept or decline button."
          action={{ href: '/applications', label: 'View applications' }}
        />
      ) : (
        <ul className="space-y-4">
          {offers.map((offer) => {
            const canRespond = offer.application.status === 'OFFER_ISSUED';
            return (
              <li key={offer.id}>
                <Card>
                  <CardContent className="pt-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold leading-tight">{offer.application.course?.name ?? 'Offer'}</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {offer.application.course?.institution?.name ?? 'Institution'} · Issued {dateLabel(offer.sentAt)}
                        </p>
                      </div>
                      <StatusBadge status={offer.application.status} />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void download(offer.id)} disabled={busy === offer.id}>
                        <Download className="size-3.5" />
                        {busy === offer.id ? 'Preparing…' : 'Download letter'}
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/applications/${offer.application.id}`}>
                          <FileText className="size-3.5" />
                          View application
                        </Link>
                      </Button>
                    </div>

                    {canRespond ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                        <Button size="sm" variant="accent" onClick={() => void respond(offer.id, 'ACCEPT')} disabled={busy === offer.id}>
                          Accept offer
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void respond(offer.id, 'DECLINE')} disabled={busy === offer.id}>
                          Decline
                        </Button>
                        <p className="text-xs text-muted-foreground">Responding is recorded and cannot be undone.</p>
                      </div>
                    ) : null}

                    {message && busy === offer.id ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {message && busy === null ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
