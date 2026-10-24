'use client';

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
import { PageHeader } from '@/components/page-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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
            setMessage(res.status === 401 ? 'Please sign in again to continue.' : 'We could not load your profile. Try again.');
          }
          return;
        }
        const data = (await res.json()) as { profile: Profile };
        if (cancelled) return;
        setForm({
          fullName: data.profile.fullName ?? '',
          phone: data.profile.phone ?? '',
          province: (data.profile.province as Province | null) ?? '',
          qualificationStatus: (data.profile.qualificationStatus as QualificationStatus | null) ?? '',
          grade: data.profile.grade ?? '',
          schoolQualification: (data.profile.schoolQualification as SchoolQualification | null) ?? '',
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
    <div className="space-y-6">
      <PageHeader
        title="Your profile"
        description="Manage your account details and profile information."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />

      {loading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading your profile…</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>About you</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" type="text" autoComplete="name" maxLength={120} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dateOfBirth">Date of birth</Label>
                <Input id="dateOfBirth" type="date" autoComplete="bday" max={latestAllowedBirthDate()} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} aria-describedby="dateOfBirth-help" />
                <p id="dateOfBirth-help" className="text-xs leading-5 text-muted-foreground">
                  Used to check that you are 16 or older. Under-18s need guardian consent before applying.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  <p className="text-xs leading-5 text-muted-foreground">Digits, spaces, + ( ) and - only.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="province">Province</Label>
                  <Select value={form.province || undefined} onValueChange={(value) => setForm({ ...form, province: value as Province })}>
                    <SelectTrigger id="province">
                      <SelectValue placeholder="Select a province" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVINCES.map((province) => (
                        <SelectItem key={province} value={province}>
                          {PROVINCE_LABELS[province]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="qualificationStatus">Where are you now?</Label>
                  <Select value={form.qualificationStatus || undefined} onValueChange={(value) => setForm({ ...form, qualificationStatus: value as QualificationStatus })}>
                    <SelectTrigger id="qualificationStatus">
                      <SelectValue placeholder="Select one" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUALIFICATION_STATUSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {QUALIFICATION_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grade">Grade</Label>
                  <Select value={form.grade === '' ? undefined : String(form.grade)} onValueChange={(value) => setForm({ ...form, grade: value === '' ? '' : Number(value) })}>
                    <SelectTrigger id="grade">
                      <SelectValue placeholder="Select a grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {[8, 9, 10, 11, 12].map((grade) => (
                        <SelectItem key={grade} value={String(grade)}>
                          Grade {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="schoolQualification">School qualification</Label>
                <Select value={form.schoolQualification || undefined} onValueChange={(value) => setForm({ ...form, schoolQualification: value as SchoolQualification })}>
                  <SelectTrigger id="schoolQualification">
                    <SelectValue placeholder="Select one" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHOOL_QUALIFICATIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {SCHOOL_QUALIFICATION_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="interests">What are you interested in?</Label>
                <Textarea id="interests" rows={3} maxLength={500} value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} placeholder="For example: helping people, computers, business" />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="accent" disabled={status === 'saving'}>
                  {status === 'saving' ? 'Saving…' : 'Save profile'}
                </Button>
                <Button asChild variant="link" className="px-0">
                  <Link href="/marks">Next: add your marks →</Link>
                </Button>
              </div>

              {message ? (
                <p role="status" aria-live="polite" className={status === 'success' ? 'text-sm text-leaf' : status === 'error' ? 'text-sm text-danger' : 'text-sm text-muted-foreground'}>
                  {message}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Guardian consent</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            If you are 16 or 17, a parent or guardian must consent before you can submit an application. Company visibility stays off for everyone under 18.
          </p>
          <Button asChild variant="link" className="mt-2 px-0">
            <Link href="/guardian-consent">Manage guardian consent →</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
