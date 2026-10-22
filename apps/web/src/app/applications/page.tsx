'use client';

/**
 * Applications step. Creates a draft for a chosen course, submits drafts, and shows where
 * each application stands. Both writes are idempotent: the key is derived from the action
 * and target, so a retry replays the first response instead of creating a duplicate.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';

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

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-paper text-ink-deep border border-line',
  SUBMITTED: 'bg-ink/10 text-ink',
  UNDER_REVIEW: 'bg-ochre/20 text-ink-deep',
  OFFER_ISSUED: 'bg-ink/15 text-ink-deep',
  ACCEPTED: 'bg-ink/25 text-ink-deep',
  DECLINED: 'bg-danger/10 text-danger',
};

/** Kept in step with the API's express.raw limit and magic-byte allowlist. */
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [loading, setLoading] = useState(true);
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
        const [appsRes, coursesRes] = await Promise.all([
          fetch('/api/applications'),
          fetch('/api/courses'),
        ]);

        if (appsRes.ok) {
          const data = (await appsRes.json()) as { applications: Application[] };
          if (!cancelled) setApplications(data.applications);
        }

        if (coursesRes.ok) {
          const data = (await coursesRes.json()) as { courses: Course[] };
          if (!cancelled) {
            setCourses(data.courses);
            // Deep link from the match screen: preselect the course the learner tapped.
            const fromQuery = new URLSearchParams(window.location.search).get('courseId');
            if (fromQuery && data.courses.some((course) => course.id === fromQuery)) {
              setSelectedCourseId(fromQuery);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('We could not load your applications. Check your connection and try again.');
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
          // Same file + same application replays the first response, so a retry cannot
          // create a second copy after a dropped connection.
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
        <h1 className="font-title text-3xl text-ink-deep">Applications</h1>
        <p className="mt-2 text-muted">
          Create a draft, submit it, and track it from draft to offer.
        </p>
        <p className="mt-2 text-sm text-muted">
          Before you can start or submit an application, add your date of birth on your{' '}
          <Link href="/profile" className="text-ink underline hover:text-ink-deep">
            profile
          </Link>
          . If you are 16 or 17, you also need{' '}
          <Link href="/guardian-consent" className="text-ink underline hover:text-ink-deep">
            guardian consent
          </Link>
          .
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
          <p className="mt-8 text-muted">Loading your applications…</p>
        ) : (
          <>
            <section className="mt-8 rounded-lg border border-line bg-paper-raised p-5" aria-label="Create an application">
              <h2 className="font-title text-xl text-ink-deep">Start a new application</h2>
              {courses.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  No courses are available yet. Check back once courses are loaded.
                </p>
              ) : (
                <form onSubmit={createApplication} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label htmlFor="course" className="mb-1 block text-sm font-medium text-ink-deep">
                      Course
                    </label>
                    <select
                      id="course"
                      value={selectedCourseId}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                      className="w-full rounded-md border border-line px-3 py-2"
                    >
                      <option value="">Choose a course</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} — {course.institution.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={busy === 'create'}
                    className="rounded-md bg-ink px-5 py-2 text-paper hover:bg-ink-deep disabled:opacity-50"
                  >
                    {busy === 'create' ? 'Creating…' : 'Create draft'}
                  </button>
                </form>
              )}
            </section>

            <section className="mt-8" aria-label="Your applications">
              <h2 className="font-title text-xl text-ink-deep">Your applications</h2>

              {applications.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  Nothing here yet. Create a draft above, or{' '}
                  <Link href="/match" className="text-ink underline hover:text-ink-deep">
                    find a course that matches you
                  </Link>
                  .
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {applications.map((application) => (
                    <li
                      key={application.id}
                      className="rounded-lg border border-line bg-paper-raised p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-title text-lg text-ink-deep">
                            {application.course?.name ?? 'Course'}
                          </h3>
                          <p className="text-sm text-muted">
                            {application.course?.institution?.name ?? 'Institution'}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            STATUS_STYLES[application.status] ?? 'bg-paper text-ink-deep border border-line'
                          }`}
                        >
                          {statusLabel(application.status)}
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-muted">
                        Started{' '}
                        {new Date(application.createdAt).toLocaleDateString('en-ZA', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {application.submittedAt && (
                          <>
                            {' '}
                            · Submitted{' '}
                            {new Date(application.submittedAt).toLocaleDateString('en-ZA', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </>
                        )}
                      </p>

                      {application.events && application.events.length > 0 && (
                        <ol className="mt-3 space-y-1 border-l border-line pl-3 text-xs text-muted">
                          {application.events.slice(0, 4).map((event) => (
                            <li key={event.id}>
                              <span className="font-medium text-ink-deep">
                                {statusLabel(event.status)}
                              </span>
                              {event.note ? ` — ${event.note}` : ''}
                            </li>
                          ))}
                        </ol>
                      )}

                      {application.documents && application.documents.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-ink-deep">Documents</h4>
                          <ul className="mt-2 space-y-1">
                            {application.documents.map((document) => (
                              <li
                                key={document.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-sm"
                              >
                                <span className="min-w-0 break-all text-muted">
                                  {document.filename}{' '}
                                  <span className="text-xs">({formatFileSize(document.size)})</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => downloadDocument(document.id)}
                                  disabled={busy === `download-${document.id}`}
                                  className="text-sm text-ink underline hover:text-ink-deep disabled:opacity-50"
                                >
                                  {busy === `download-${document.id}` ? 'Preparing…' : 'Download'}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {application.status === 'DRAFT' && (
                        <div className="mt-4">
                          <label
                            htmlFor={`document-${application.id}`}
                            className="block text-sm font-medium text-ink-deep"
                          >
                            Add a document (PDF, JPG or PNG, up to 5 MB)
                          </label>
                          <input
                            id={`document-${application.id}`}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            disabled={busy === `upload-${application.id}`}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              // Reset the input so choosing the same file again still fires.
                              event.target.value = '';
                              if (file) void uploadDocument(application.id, file);
                            }}
                            className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:text-paper hover:file:bg-ink-deep disabled:opacity-50"
                          />
                          {busy === `upload-${application.id}` && (
                            <p className="mt-1 text-xs text-muted">Attaching document…</p>
                          )}
                        </div>
                      )}

                      {application.status === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => submitApplication(application.id)}
                          disabled={busy === application.id || busy === `upload-${application.id}`}
                          className="mt-4 rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-ink-deep disabled:opacity-50"
                        >
                          {busy === application.id ? 'Submitting…' : 'Submit application'}
                        </button>
                      )}
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
