'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Compass, Sparkles, Target } from 'lucide-react';
import { PageHeader, EmptyState, ErrorState } from '@/components/page-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Recommendation = {
  course: {
    id: string;
    name: string;
    code: string | null;
    field: string;
    qualification: string | null;
    apsMin: number;
    institution: { name: string; province: string; type: string };
  };
  score: number;
  why: string;
  improvements: string[];
  aiEnhanced: boolean;
};

type MatchResponse = {
  aps: { score: number; maxScore: number };
  recommendations: Recommendation[];
  filtered: { total: number; eligible: number; affordable: number };
};

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function MatchPage() {
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function findMatches() {
    setStatus('loading');
    setMessage('');
    setResult(null);

    try {
      const res = await fetch('/api/match', { method: 'POST' });
      if (!res.ok) {
        setStatus('error');
        setMessage(
          res.status === 401
            ? 'Please sign in again to see matches.'
            : res.status === 403
              ? 'Only learner accounts can request course matches.'
              : 'We could not work out your matches. Try again.',
        );
        return;
      }

      const data = (await res.json()) as MatchResponse;
      setResult(data);
      setStatus('success');
    } catch {
      setStatus('error');
      setMessage('We could not reach the server. Check your connection and try again.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Course matches"
        description="We filter by your APS, subjects, province and budget first. The AI only explains the shortlist; it never decides who qualifies."
        action={
          <Button onClick={() => void findMatches()} disabled={status === 'loading'} variant="accent">
            <Compass className="size-4" />
            {status === 'loading' ? 'Finding matches…' : result ? 'Refresh matches' : 'Find matching courses'}
          </Button>
        }
      />

      {status === 'idle' ? (
        <EmptyState
          illustration="match"
          title="Start with what fits"
          body="We check every seeded course against your APS and subject rules, then show the ones worth your time."
          secondary={
            <Button asChild variant="link">
              <Link href="/marks">Update your marks first</Link>
            </Button>
          }
        />
      ) : null}

      {status === 'error' ? <ErrorState title="Matches did not load" body={message} retryHref="/match" /> : null}

      {status === 'success' && result ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-1">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Your APS</p>
                <p className="tabular mt-2 text-2xl font-semibold">
                  {result.aps.score}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ {result.aps.maxScore}</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-1">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Met entry rules</p>
                <p className="tabular mt-2 text-2xl font-semibold">{result.filtered.eligible}</p>
                <p className="mt-1 text-xs text-muted-foreground">of {result.filtered.total} courses</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-1">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Fit your budget</p>
                <p className="tabular mt-2 text-2xl font-semibold">{result.filtered.affordable}</p>
                <p className="mt-1 text-xs text-muted-foreground">after entry rules</p>
              </CardContent>
            </Card>
          </section>

          {result.recommendations.length === 0 ? (
            <EmptyState
              illustration="match"
              title="No matches yet"
              body="That usually means your APS is still below the entry bar, or your province and subject preferences are narrow. Improve your marks or widen your preferences, then try again."
              action={{ href: '/marks', label: 'Update marks' }}
              secondary={
                <Button asChild variant="link">
                  <Link href="/profile">Update profile</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-4">
              {result.recommendations.map((item) => (
                <li key={item.course.id}>
                  <Card>
                    <CardContent className="pt-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-xl font-semibold leading-tight">{item.course.name}</h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.course.institution.name} · {titleCase(item.course.institution.province)} · {titleCase(item.course.field)}
                          </p>
                        </div>
                        <Badge variant="leaf" className="h-7 px-3 text-sm">
                          <Target className="size-3.5" />
                          {Math.round(item.score)}% fit
                        </Badge>
                      </div>

                      <p className="mt-4 text-sm leading-6">{item.why}</p>

                      {item.improvements.length > 0 ? (
                        <div className="mt-4 rounded-lg bg-mist p-3">
                          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            How to improve your chances
                          </h3>
                          <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm leading-6 text-muted-foreground">
                            {item.improvements.map((improvement) => (
                              <li key={improvement}>{improvement}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button asChild variant="accent" size="sm">
                          <Link href={`/applications?courseId=${encodeURIComponent(item.course.id)}`}>
                            Apply to this course
                            <ArrowRight className="size-4" />
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href="/funding">Check funding</Link>
                        </Button>
                        <span className="text-xs text-muted-foreground">Needs APS {item.course.apsMin}</span>
                        {!item.aiEnhanced ? (
                          <Badge variant="neutral">
                            <Sparkles className="size-3" />
                            Plain-language reason
                          </Badge>
                        ) : (
                          <Badge variant="sky">
                            <Sparkles className="size-3" />
                            AI explained
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
