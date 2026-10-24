'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

type CV = {
  contact: { fullName: string; email: string; phone: string; province: string };
  profileSummary: string;
  education: Array<{ institution: string; qualification: string; year: string; details: string }>;
  skills: string[];
  achievements: string[];
  projects: Array<{ name: string; description: string; year: string }>;
  experience: Array<{ role: string; organisation: string; year: string; description: string }>;
  references: Array<{ name: string; contact: string; relation: string }>;
};

export default function CvPage() {
  const [cv, setCv] = useState<CV | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>({});

  useEffect(() => {
    fetch('/api/auth/get-session')
      .then((r) => r.json())
      .then((s) => setUser(s.user || {}))
      .catch(() => {});
  }, []);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch('/api/cv/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (res.ok) {
        const data = await res.json();
        setCv(data.cv);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const isStudent = user.role === 'STUDENT';

  return (
    <div className="space-y-6">
      <PageHeader
        title="CV generator"
        description="AI-powered CV generation from your profile, marks and applications."
        action={
          isStudent ? (
            <Button onClick={generate} disabled={loading} variant="default">
              {loading ? 'Generating...' : 'Generate with AI'}
            </Button>
          ) : undefined
        }
      />

      {!isStudent ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            CV generation is available for students only.
          </CardContent>
        </Card>
      ) : cv ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm"><strong>Name:</strong> {cv.contact.fullName}</p>
              <p className="text-sm"><strong>Email:</strong> {cv.contact.email}</p>
              <p className="text-sm"><strong>Phone:</strong> {cv.contact.phone}</p>
              <p className="text-sm"><strong>Province:</strong> {cv.contact.province}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{cv.profileSummary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Education</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cv.education.length === 0 ? (
                <p className="text-sm text-muted-foreground">None</p>
              ) : (
                cv.education.map((e, i) => (
                  <div key={i}>
                    <p className="text-sm font-medium">{e.qualification} - {e.institution}</p>
                    <p className="text-xs text-muted-foreground">{e.year}</p>
                    <p className="text-sm">{e.details}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {cv.skills.map((s, i) => (
                  <span key={i} className="rounded-full bg-primary/10 px-3 py-1 text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {cv.achievements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Achievements</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-4">
                  {cv.achievements.map((a, i) => (
                    <li key={i} className="text-sm">{a}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              Export/Print
            </Button>
            <Button variant="outline" onClick={() => setCv(null)}>
              Generate New
            </Button>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="mb-4 text-sm text-muted-foreground">Click "Generate with AI" to create your CV from your profile data.</p>
            {isStudent && (
              <Button onClick={generate} disabled={loading} variant="default">
                {loading ? 'Generating...' : 'Generate with AI'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
