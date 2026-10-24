'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Download, FileText, Upload } from 'lucide-react';
import { PageHeader, ErrorState, StatusBadge, SkeletonList } from '@/components/page-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Application = {
  id: string;
  courseId: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  course?: { name: string; institution?: { name: string; province: string } };
  documents?: Array<{ id: string; filename: string; mimeType: string; size: number; uploadedAt: string }>;
  events?: Array<{ id: string; status: string; note: string | null; createdAt: string }>;
};

const STEP_ORDER = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'OFFER_ISSUED', 'ACCEPTED'];

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    const res = await fetch('/api/applications');
    if (!res.ok) throw new Error('load');
    const data = (await res.json()) as { applications: Application[] };
    const found = data.applications.find((item) => item.id === params.id) ?? null;
    setApplication(found);
    if (!found) setError(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function submit() {
    if (!application) return;
    setBusy('submit');
    setMessage('');
    try {
      const res = await fetch(`/api/applications/${application.id}/submit`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `submit-${application.id}` },
      });
      if (!res.ok) throw new Error('submit');
      await load();
      setMessage('Application submitted.');
    } catch {
      setMessage('We could not submit this application. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    if (!application) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage('Choose a PDF, JPG or PNG under 5 MB.');
      return;
    }
    setBusy('upload');
    setMessage('');
    try {
      const res = await fetch(`/api/applications/${application.id}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-Filename': file.name,
          'Idempotency-Key': `doc-${application.id}-${file.name}-${file.size}-${file.lastModified}`,
        },
        body: file,
      });
      if (!res.ok) throw new Error('upload');
      await load();
      setMessage('Document attached.');
    } catch {
      setMessage('We could not attach that document. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function downloadDocument(documentId: string) {
    setBusy(`download-${documentId}`);
    try {
      const res = await fetch(`/api/documents/${documentId}/url`);
      if (!res.ok) throw new Error('download');
      const data = (await res.json()) as { download: { url: string } };
      window.location.assign(data.download.url);
    } catch {
      setMessage('That document is not available. Try again.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Application" />
        <SkeletonList rows={2} />
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="space-y-6">
        <PageHeader title="Application" />
        <ErrorState title="Application not found" body="This application does not exist on your account." retryHref="/applications" />
      </div>
    );
  }

  const currentIndex = Math.max(0, STEP_ORDER.indexOf(application.status));
  const completeSteps = application.status === 'DECLINED' ? STEP_ORDER.length : currentIndex + 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title={application.course?.name ?? 'Application'}
        description={`${application.course?.institution?.name ?? 'Institution'} · started ${dateLabel(application.createdAt)}`}
        breadcrumb={<Link href="/applications">← Applications</Link>}
        action={<StatusBadge status={application.status} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-5">
            {STEP_ORDER.map((step, index) => {
              const done = index < completeSteps;
              const current = index === currentIndex;
              return (
                <li key={step} className="flex items-center gap-2 sm:flex-col sm:items-start">
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-primary text-white' : current ? 'border-2 border-protea bg-protea-soft text-protea' : 'border border-border text-muted-foreground'}`}>
                    {index + 1}
                  </span>
                  <span className={`text-xs font-medium ${current ? 'text-protea' : done ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {statusLabel(step)}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 rounded-lg bg-mist p-3 text-sm leading-6 text-muted-foreground">
            {application.status === 'DRAFT'
              ? 'This is a draft. Attach any documents you need, then submit when ready.'
              : 'Your application is with the institution. We will add any status change here.'}
          </p>
          {application.status === 'DRAFT' ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="accent" onClick={() => void submit()} disabled={busy === 'submit'}>
                {busy === 'submit' ? 'Submitting…' : 'Submit application'}
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/offers">Go to Offers</Link>
              </Button>
            </div>
          ) : null}
          {application.status === 'SUBMITTED' ? (
            <Button className="mt-4" variant="outline" onClick={async () => {
              setBusy('simulate');
              setMessage('');
              try {
                const res = await fetch(`/api/applications/${application.id}/simulate-review`, {
                  method: 'POST',
                  headers: { 'Idempotency-Key': `sim-${application.id}` },
                });
                if (res.ok) {
                  const data = await res.json();
                  await load();
                  setMessage(data.status === 'OFFER_ISSUED' ? 'Simulated offer issued. Check Offers.' : 'Simulation complete.');
                } else {
                  setMessage('Simulation not available right now.');
                }
              } catch {
                setMessage('Simulation failed.');
              } finally {
                setBusy(null);
              }
            }} disabled={busy === 'simulate'}>
              {busy === 'simulate' ? 'Simulating…' : 'Simulate institution response'}
            </Button>
          ) : null}
          {message ? <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {application.events && application.events.length > 0 ? (
              <ol className="space-y-4 border-l border-border pl-4">
                {application.events.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-sky" aria-hidden="true" />
                    <p className="text-sm font-medium">{statusLabel(event.status)}</p>
                    <p className="text-xs text-muted-foreground">{dateLabel(event.createdAt)}</p>
                    {event.note ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{event.note}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent>
            {application.documents && application.documents.length > 0 ? (
              <ul className="space-y-2">
                {application.documents.map((document) => (
                  <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{document.filename}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(document.size)}</span>
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void downloadDocument(document.id)} disabled={busy === `download-${document.id}`}>
                      <Download className="size-3.5" />
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No documents attached yet.</p>
            )}

            {application.status === 'DRAFT' ? (
              <label className="mt-4 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
                <Upload className="size-4" aria-hidden="true" />
                {busy === 'upload' ? 'Attaching…' : 'Attach document'}
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="sr-only"
                  disabled={busy === 'upload'}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void upload(file);
                  }}
                />
              </label>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">PDF, JPG or PNG up to 5 MB. Only you can download these files.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
