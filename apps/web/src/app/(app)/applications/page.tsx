'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, FilePlus2, FileText, Upload } from 'lucide-react';
import { PageHeader, EmptyState, ErrorState, StatusBadge, SkeletonList } from '@/components/page-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Application = {
  id: string;
  courseId: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  course?: {
    name: string;
    institution?: { name: string; province: string };
  };
  documents?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    uploadedAt: string;
  }>;
  events?: Array<{ id: string; status: string; note: string | null; createdAt: string }>;
};

type Course = {
  id: string;
  name: string;
  field: string;
  apsMin: number;
  institution: { name: string; province: string };
};

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function loadApplications() {
    const res = await fetch('/api/applications');
    if (!res.ok) throw new Error('applications');
    const data = (await res.json()) as { applications: Application[] };
    setApplications(data.applications);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [appsRes, coursesRes] = await Promise.all([fetch('/api/applications'), fetch('/api/courses')]);
        if (appsRes.ok) {
          const data = (await appsRes.json()) as { applications: Application[] };
          if (!cancelled) setApplications(data.applications);
        } else if (!cancelled) {
          setLoadError(true);
        }
        if (coursesRes.ok) {
          const data = (await coursesRes.json()) as { courses: Course[] };
          if (!cancelled) {
            setCourses(data.courses);
            const fromQuery = new URLSearchParams(window.location.search).get('courseId');
            if (fromQuery && data.courses.some((course) => course.id === fromQuery)) {
              setSelectedCourseId(fromQuery);
            }
          }
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId) {
      setStatus('error');
      setMessage('Choose a course first.');
      return;
    }

    setBusy('create');
    setStatus('idle');
    setMessage('');

    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `create-${selectedCourseId}`,
        },
        body: JSON.stringify({ courseId: selectedCourseId }),
      });

      if (res.status === 409) {
        await loadApplications();
        setStatus('error');
        setMessage('You already have an application for this course.');
        return;
      }

      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus('error');
        setMessage(
          res.status === 401
            ? 'Please sign in again to apply.'
            : detail?.error ?? 'We could not create that application. Try again.',
        );
        return;
      }

      await loadApplications();
      setSelectedCourseId('');
      setStatus('success');
      setMessage('Draft created. Submit it when your details are ready.');
    } catch {
      setStatus('error');
      setMessage('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function submitApplication(id: string) {
    setBusy(id);
    setStatus('idle');
    setMessage('');

    try {
      const res = await fetch(`/api/applications/${id}/submit`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `submit-${id}` },
      });

      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus('error');
        setMessage(
          res.status === 401
            ? 'Please sign in again to submit.'
            : detail?.error ?? 'We could not submit that application. Reload and try again.',
        );
        return;
      }

      await loadApplications();
      setStatus('success');
      setMessage('Application submitted. We will show status changes here.');
    } catch {
      setStatus('error');
      setMessage('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function uploadDocument(applicationId: string, file: File) {
    if (!DOCUMENT_TYPES.includes(file.type)) {
      setStatus('error');
      setMessage('Choose a PDF, JPG or PNG file.');
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setStatus('error');
      setMessage('That file is larger than 5 MB. Choose a smaller copy.');
      return;
    }

    setBusy(`upload-${applicationId}`);
    setStatus('idle');
    setMessage('');

    try {
      const res = await fetch(`/api/applications/${applicationId}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-Filename': file.name,
          'Idempotency-Key': `doc-${applicationId}-${file.name}-${file.size}-${file.lastModified}`,
        },
        body: file,
      });

      if (!res.ok) {
        setStatus('error');
        setMessage(
          res.status === 413
            ? 'That file is too large. Choose one under 5 MB.'
            : res.status === 415
              ? 'That file type is not accepted. Use a PDF, JPG or PNG.'
              : res.status === 422
                ? 'This application can no longer take documents, or has reached its limit.'
                : 'We could not attach that document. Try again.',
        );
        return;
      }

      await loadApplications();
      setStatus('success');
      setMessage('Document attached.');
    } catch {
      setStatus('error');
      setMessage('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function downloadDocument(documentId: string) {
    setBusy(`download-${documentId}`);
    setStatus('idle');
    setMessage('');

    try {
      const res = await fetch(`/api/documents/${documentId}/url`);
      if (!res.ok) {
        setStatus('error');
        setMessage('That document is not available. Reload and try again.');
        return;
      }
      const data = (await res.json()) as { download: { url: string } };
      window.location.assign(data.download.url);
    } catch {
      setStatus('error');
      setMessage('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Applications" description="Create a draft, submit it and track it from draft to offer." />
        <SkeletonList rows={2} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Applications" />
        <ErrorState title="Applications did not load" retryHref="/applications" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Create a draft, submit it and track it from draft to offer. Before you start, add your date of birth and, if you are 16 or 17, guardian consent."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/profile">Check profile</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Start a new application</CardTitle>
        </CardHeader>
        <CardContent>
          {courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses are available yet.</p>
          ) : (
            <form onSubmit={createApplication} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <label htmlFor="course" className="text-sm font-medium">Course</label>
                <select
                  id="course"
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <option value="">Choose a course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name} — {course.institution.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="accent" disabled={busy === 'create'}>
                <FilePlus2 className="size-4" />
                {busy === 'create' ? 'Creating…' : 'Create draft'}
              </Button>
            </form>
          )}
          {message ? (
            <p role="status" aria-live="polite" className={`mt-4 text-sm ${status === 'error' ? 'text-danger' : 'text-leaf'}`}>
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {applications.length === 0 ? (
        <EmptyState
          illustration="applications"
          title="No applications yet"
          body="Find a course that fits your APS, then create a draft. You can attach documents and submit when ready."
          action={{ href: '/match', label: 'Find a course' }}
        />
      ) : (
        <ul className="space-y-4">
          {applications.map((application) => (
            <li key={application.id}>
              <Card>
                <CardContent className="pt-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold leading-tight">{application.course?.name ?? 'Course'}</h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {application.course?.institution?.name ?? 'Institution'}
                      </p>
                    </div>
                    <StatusBadge status={application.status} />
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Started {dateLabel(application.createdAt)}
                    {application.submittedAt ? ` · Submitted ${dateLabel(application.submittedAt)}` : ''}
                  </p>

                  {application.events && application.events.length > 0 ? (
                    <ol className="mt-4 space-y-2 border-l border-border pl-4 text-xs">
                      {application.events.slice(0, 4).map((event) => (
                        <li key={event.id} className="relative">
                          <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-sky" aria-hidden="true" />
                          <span className="font-medium text-foreground">{statusLabel(event.status)}</span>
                          <span className="ml-1 text-muted-foreground">{dateLabel(event.createdAt)}</span>
                          {event.note ? <p className="mt-0.5 leading-5 text-muted-foreground">{event.note}</p> : null}
                        </li>
                      ))}
                    </ol>
                  ) : null}

                  {application.documents && application.documents.length > 0 ? (
                    <div className="mt-4 rounded-lg bg-mist/60 p-3">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Documents</h3>
                      <ul className="mt-2 space-y-1.5">
                        {application.documents.map((document) => (
                          <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span className="truncate">{document.filename}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">({formatFileSize(document.size)})</span>
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void downloadDocument(document.id)}
                              disabled={busy === `download-${document.id}`}
                            >
                              <Download className="size-3.5" />
                              {busy === `download-${document.id}` ? 'Preparing…' : 'Download'}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {application.status === 'DRAFT' ? (
                    <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`document-${application.id}`} className="block text-sm font-medium">
                          Add a document
                        </label>
                        <p className="text-xs text-muted-foreground">PDF, JPG or PNG, up to 5 MB.</p>
                        <label className="mt-2 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
                          <Upload className="size-4" aria-hidden="true" />
                          Choose file
                          <input
                            id={`document-${application.id}`}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            disabled={busy === `upload-${application.id}`}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              if (file) void uploadDocument(application.id, file);
                            }}
                            className="sr-only"
                          />
                        </label>
                        {busy === `upload-${application.id}` ? (
                          <p className="mt-1 text-xs text-muted-foreground">Attaching document…</p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        onClick={() => void submitApplication(application.id)}
                        disabled={busy === application.id || busy === `upload-${application.id}`}
                      >
                        {busy === application.id ? 'Submitting…' : 'Submit application'}
                      </Button>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <Button asChild variant="link" className="px-0">
                      <Link href={`/applications/${application.id}`}>Open application details →</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
