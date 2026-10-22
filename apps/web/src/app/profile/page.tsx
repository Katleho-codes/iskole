'use client';

/**
 * Profile step of the guided journey.
 *
 * Fields and value sets come from @iskole/shared (profileUpdateSchema). The API validates
 * with .strict(), so sending anything not on that schema (for example the old
 * firstName/lastName pair) is a 400. Keep this form in step with packages/shared.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PROVINCES,
  QUALIFICATION_STATUSES,
  SCHOOL_QUALIFICATIONS,
  type Province,
  type QualificationStatus,
  type SchoolQualification,
} from '@iskole/shared';

type Profile = {
  fullName: string | null;
  phone: string | null;
  province: string | null;
  qualificationStatus: string | null;
  grade: number | null;
  schoolQualification: string | null;
  interests: string | null;
  dateOfBirth: string | null;
};

const PROVINCE_LABELS: Record<Province, string> = {
  EASTERN_CAPE: 'Eastern Cape',
  FREE_STATE: 'Free State',
  GAUTENG: 'Gauteng',
  KWAZULU_NATAL: 'KwaZulu-Natal',
  LIMPOPO: 'Limpopo',
  MPUMALANGA: 'Mpumalanga',
  NORTHERN_CAPE: 'Northern Cape',
  NORTH_WEST: 'North West',
  WESTERN_CAPE: 'Western Cape',
};

const QUALIFICATION_LABELS: Record<QualificationStatus, string> = {
  AT_SCHOOL: 'At school',
  COMPLETED_SCHOOL: 'Completed school',
  STUDYING: 'Studying',
  QUALIFIED: 'Qualified',
};

const SCHOOL_QUALIFICATION_LABELS: Record<SchoolQualification, string> = {
  NSC: 'NSC',
  NSC_IEB: 'NSC (IEB)',
  SENIOR_CERTIFICATE: 'Senior certificate',
  NONE: 'None yet',
};

const EMPTY_FORM = {
  fullName: '',
  phone: '',
  province: '' as Province | '',
  qualificationStatus: '' as QualificationStatus | '',
  grade: '' as number | '',
  schoolQualification: '' as SchoolQualification | '',
  interests: '',
  dateOfBirth: '',
};

/** The latest date of birth that still makes the learner 16 today. */
function latestAllowedBirthDate(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 16);
  return date.toISOString().slice(0, 10);
}

export default function ProfilePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/profile');
        if (!res.ok) {
          if (!cancelled) {
            setStatus('error');
            setMessage(
              res.status === 401
                ? 'Please sign in again to continue.'
                : 'We could not load your profile. Try again.',
            );
          }
          return;
        }
        const data = (await res.json()) as { profile: Profile };
        if (cancelled) return;
        setForm({
          fullName: data.profile.fullName ?? '',
          phone: data.profile.phone ?? '',
          province: (data.profile.province as Province | null) ?? '',
          qualificationStatus:
            (data.profile.qualificationStatus as QualificationStatus | null) ?? '',
          grade: data.profile.grade ?? '',
          schoolQualification:
            (data.profile.schoolQualification as SchoolQualification | null) ?? '',
          interests: data.profile.interests ?? '',
          dateOfBirth: data.profile.dateOfBirth ?? '',
        });
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('We could not load your profile. Check your connection and try again.');
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');

    // Send only fields the learner actually filled in. The API treats every field as
    // optional, so empty inputs are omitted rather than sent as empty strings.
    const body: Record<string, unknown> = {};
    if (form.fullName.trim()) body.fullName = form.fullName.trim();
    if (form.phone.trim()) body.phone = form.phone.trim();
    if (form.province) body.province = form.province;
    if (form.qualificationStatus) body.qualificationStatus = form.qualificationStatus;
    if (form.grade !== '') body.grade = form.grade;
    if (form.schoolQualification) body.schoolQualification = form.schoolQualification;
    if (form.interests.trim()) body.interests = form.interests.trim();
    if (form.dateOfBirth) body.dateOfBirth = form.dateOfBirth;

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setStatus('success');
        setMessage('Saved. Your details are now used for matching and funding.');
        return;
      }

      const detail = (await res.json().catch(() => null)) as
        | { error?: string; issues?: Array<{ path?: string[]; message?: string }> }
        | null;
      const firstIssue = detail?.issues?.[0];
      setStatus('error');
      setMessage(
        firstIssue?.message
          ? `${firstIssue.path?.join('.') ?? 'Field'}: ${firstIssue.message}`
          : detail?.error === 'verify your email address first'
            ? 'Please verify your email address before saving.'
            : 'We could not save your profile. Check the fields and try again.',
      );
    } catch {
      setStatus('error');
      setMessage('We could not save your profile. Check your connection and try again.');
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

      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="font-title text-3xl text-ink-deep">Your profile</h1>
        <p className="mt-2 text-muted">
          These details decide which courses and funding options we can match you to.
        </p>

        {loading ? (
          <p className="mt-8 text-muted">Loading your profile…</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-ink-deep">
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                maxLength={120}
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full rounded-md border border-line px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="dateOfBirth" className="mb-1 block text-sm font-medium text-ink-deep">
                Date of birth
              </label>
              <input
                id="dateOfBirth"
                type="date"
                autoComplete="bday"
                max={latestAllowedBirthDate()}
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                className="w-full rounded-md border border-line px-3 py-2"
                aria-describedby="dateOfBirth-help"
              />
              <p id="dateOfBirth-help" className="mt-1 text-xs text-muted">
                Used to check that you are 16 or older. Under-18s need guardian consent before
                applying. You can change it later.
              </p>
            </div>

            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium text-ink-deep">
                Phone number
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-md border border-line px-3 py-2"
              />
              <p className="mt-1 text-xs text-muted">Digits, spaces, + ( ) and - only.</p>
            </div>

            <div>
              <label htmlFor="province" className="mb-1 block text-sm font-medium text-ink-deep">
                Province
              </label>
              <select
                id="province"
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value as Province | '' })}
                className="w-full rounded-md border border-line px-3 py-2"
              >
                <option value="">Select a province</option>
                {PROVINCES.map((province) => (
                  <option key={province} value={province}>
                    {PROVINCE_LABELS[province]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="qualificationStatus"
                className="mb-1 block text-sm font-medium text-ink-deep"
              >
                Where are you now?
              </label>
              <select
                id="qualificationStatus"
                value={form.qualificationStatus}
                onChange={(e) =>
                  setForm({
                    ...form,
                    qualificationStatus: e.target.value as QualificationStatus | '',
                  })
                }
                className="w-full rounded-md border border-line px-3 py-2"
              >
                <option value="">Select one</option>
                {QUALIFICATION_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {QUALIFICATION_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="grade" className="mb-1 block text-sm font-medium text-ink-deep">
                Grade
              </label>
              <select
                id="grade"
                value={form.grade}
                onChange={(e) =>
                  setForm({ ...form, grade: e.target.value === '' ? '' : Number(e.target.value) })
                }
                className="w-full rounded-md border border-line px-3 py-2"
              >
                <option value="">Select a grade</option>
                {[8, 9, 10, 11, 12].map((grade) => (
                  <option key={grade} value={grade}>
                    Grade {grade}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="schoolQualification"
                className="mb-1 block text-sm font-medium text-ink-deep"
              >
                School qualification
              </label>
              <select
                id="schoolQualification"
                value={form.schoolQualification}
                onChange={(e) =>
                  setForm({
                    ...form,
                    schoolQualification: e.target.value as SchoolQualification | '',
                  })
                }
                className="w-full rounded-md border border-line px-3 py-2"
              >
                <option value="">Select one</option>
                {SCHOOL_QUALIFICATIONS.map((value) => (
                  <option key={value} value={value}>
                    {SCHOOL_QUALIFICATION_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="interests" className="mb-1 block text-sm font-medium text-ink-deep">
                What are you interested in?
              </label>
              <textarea
                id="interests"
                rows={3}
                maxLength={500}
                value={form.interests}
                onChange={(e) => setForm({ ...form, interests: e.target.value })}
                className="w-full rounded-md border border-line px-3 py-2"
                placeholder="For example: helping people, computers, business"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={status === 'saving'}
                className="rounded-md bg-ink px-6 py-2 text-white hover:bg-ink-deep disabled:opacity-50"
              >
                {status === 'saving' ? 'Saving…' : 'Save profile'}
              </button>
              <Link href="/marks" className="text-sm text-ink underline hover:text-ink-deep">
                Next: add your marks →
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

        <section className="mt-8 rounded-lg border border-line bg-paper-raised p-5">
          <h2 className="font-title text-xl text-ink-deep">Guardian consent</h2>
          <p className="mt-2 text-sm text-muted">
            If you are 16 or 17, a parent or guardian must consent before you can submit an
            application. Company visibility stays off for everyone under 18.
          </p>
          <Link
            href="/guardian-consent"
            className="mt-3 inline-block text-sm font-medium text-ink underline hover:text-ink-deep"
          >
            Manage guardian consent →
          </Link>
        </section>
      </main>
    </div>
  );
}
