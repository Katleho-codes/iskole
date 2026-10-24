import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  FileText,
  GraduationCap,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState, ErrorState, StatCard, StatusBadge } from '@/components/page-parts';
import { getDict } from '@/i18n/strings';
import { serverApi } from '@/lib/server-api';

type Dashboard = {
  learner: { firstName: string; fullName: string };
  journey: Array<{ key: string; label: string; complete: boolean; href: string }>;
  nextStep: { key: string; title: string; body: string; href: string; cta: string };
  aps: { score: number; maxScore: number; counted: number };
  today: {
    day: string;
    blocks: Array<{ task: string; startTime: string | null; durationMinutes: number | null }>;
  };
  deadlines: Array<{
    id: string;
    title: string;
    provider: string;
    deadline: string | null;
    daysLeft: number | null;
    href: string;
  }>;
  applications: Array<{
    id: string;
    status: string;
    courseName: string;
    institution: string;
    updatedAt: string;
  }>;
  money: { spentCents: number; budgetCents: number; monthStart: string };
  notifications: Array<{ id: string; title: string; body: string; href: string | null; createdAt: string }>;
  stats: { applications: number; savedFunding: number; offers: number; studyBlocksToday: number };
};

const dict = getDict('en');

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function rand(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function shortDate(value: string | null) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(new Date(value));
}

export default async function DashboardPage() {
  const result = await serverApi<Dashboard>('/api/dashboard');
  if (!result.ok && result.status === 401) redirect('/signin');
  if (!result.ok || !result.data) {
    return (
      <ErrorState
        title="Home did not load"
        body="We could not reach your dashboard. Your data is safe; try once more."
        retryHref="/dashboard"
      />
    );
  }

  const data = result.data;
  const currentIndex = data.journey.findIndex((step) => !step.complete);
  const completeCount = data.journey.filter((step) => step.complete).length;
  const budgetProgress =
    data.money.budgetCents > 0
      ? Math.min(100, Math.round((data.money.spentCents / data.money.budgetCents) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[10px] bg-navy px-5 py-6 text-white sm:px-7 sm:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[58ch]">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/65">
              {data.today.day.charAt(0) + data.today.day.slice(1).toLowerCase()} · your next step
            </p>
            <h1 className="mt-2 text-[2rem] font-semibold leading-tight sm:text-[2.5rem]">
              {greeting()}, {data.learner.firstName}
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/80 sm:text-base">{data.nextStep.body}</p>
          </div>
          <Button asChild variant="accent" size="lg" className="w-full shrink-0 sm:w-auto">
            <Link href={data.nextStep.href}>
              {data.nextStep.cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="journey-heading" className="rounded-[10px] border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="journey-heading" className="text-lg font-semibold">
              Your journey
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {completeCount} of {data.journey.length} steps done. One thing at a time.
            </p>
          </div>
          <Badge variant="sky">{data.nextStep.key === 'done' ? 'Ready' : 'Next: ' + data.journey[currentIndex]?.label}</Badge>
        </div>

        <div className="mt-5 overflow-x-auto pb-1">
          <ol className="flex min-w-[620px] items-start">
            {data.journey.map((step, index) => {
              const complete = step.complete;
              const current = index === currentIndex;
              return (
                <li key={step.key} className="relative flex flex-1 flex-col items-center text-center">
                  {index < data.journey.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={`absolute left-1/2 top-4 h-0.5 w-full ${complete ? 'bg-primary' : 'bg-border'}`}
                    />
                  ) : null}
                  <Link
                    href={step.href}
                    aria-current={current ? 'step' : undefined}
                    className="group relative z-10 flex flex-col items-center gap-2 rounded-lg p-1"
                  >
                    <span
                      className={`flex size-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                        complete
                          ? 'border-primary bg-primary text-white'
                          : current
                            ? 'border-2 border-protea bg-protea-soft text-protea'
                            : 'border-border bg-card text-muted-foreground group-hover:border-sky'
                      }`}
                    >
                      {complete ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        current ? 'text-protea' : complete ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="APS"
          value={data.aps.score > 0 ? `${data.aps.score} / ${data.aps.maxScore}` : '—'}
          hint={data.aps.counted > 0 ? `${data.aps.counted} subjects counted` : 'Add marks to calculate'}
          icon={GraduationCap}
          tone="sky"
        />
        <StatCard
          label="Applications"
          value={data.stats.applications}
          hint={data.stats.offers > 0 ? `${data.stats.offers} offer${data.stats.offers === 1 ? '' : 's'} to answer` : 'No offers yet'}
          icon={FileText}
          tone={data.stats.offers > 0 ? 'rose' : 'default'}
        />
        <StatCard
          label="Saved funding"
          value={data.stats.savedFunding}
          hint={data.stats.savedFunding > 0 ? 'Ready to compare' : 'Save up to 3 to compare'}
          icon={Wallet}
          tone="leaf"
        />
        <StatCard
          label="Study today"
          value={data.stats.studyBlocksToday}
          hint={data.stats.studyBlocksToday === 0 ? 'A clear day' : 'Blocks on your calendar'}
          icon={CalendarDays}
          tone="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Today</CardTitle>
            <Link href="/study-plan" className="text-sm font-medium text-sky hover:underline">
              Study plan
            </Link>
          </CardHeader>
          <CardContent>
            {data.today.blocks.length === 0 ? (
              <div className="flex items-center gap-4 rounded-lg border border-dashed border-border bg-mist/60 px-4 py-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-sky">
                  <CalendarDays className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">A clear day</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Nothing is scheduled. Build a study plan when you are ready.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="ml-auto shrink-0">
                  <Link href="/study-plan">Create plan</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.today.blocks.map((block, index) => (
                  <li key={`${block.task}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="tabular w-14 shrink-0 text-sm font-medium text-sky">
                      {block.startTime ?? 'Anytime'}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">{block.task}</span>
                    {block.durationMinutes ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{block.durationMinutes} min</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Deadlines</CardTitle>
            <Link href="/funding" className="text-sm font-medium text-sky hover:underline">
              Funding
            </Link>
          </CardHeader>
          <CardContent>
            {data.deadlines.length === 0 ? (
              <p className="text-sm leading-6 text-muted-foreground">No funding deadlines in the window.</p>
            ) : (
              <ul className="space-y-3">
                {data.deadlines.map((deadline) => (
                  <li key={deadline.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium leading-5">{deadline.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{deadline.provider}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{shortDate(deadline.deadline)}</span>
                      <Badge
                        variant={
                          deadline.daysLeft !== null && deadline.daysLeft <= 7
                            ? 'amber'
                            : 'neutral'
                        }
                      >
                        {deadline.daysLeft === null
                          ? 'Check date'
                          : deadline.daysLeft === 0
                            ? 'Closes today'
                            : `${deadline.daysLeft} days`}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Applications</CardTitle>
            <Link href="/applications" className="text-sm font-medium text-sky hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {data.applications.length === 0 ? (
              <EmptyState
                illustration="applications"
                title="No applications yet"
                body="When you find a course and funding you like, apply in one place."
                action={{ href: '/match', label: 'Find a course' }}
                compact
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.applications.map((application) => (
                  <li key={application.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <FileText className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{application.courseName}</p>
                      <p className="truncate text-xs text-muted-foreground">{application.institution}</p>
                    </div>
                    <StatusBadge status={application.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Money</CardTitle>
              <Link href="/money" className="text-sm font-medium text-sky hover:underline">
                Open
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="tabular text-2xl font-semibold">{rand(data.money.spentCents)}</span>
                <span className="text-xs text-muted-foreground">this month</span>
              </div>
              {data.money.budgetCents > 0 ? (
                <>
                  <Progress value={budgetProgress} />
                  <p className="text-xs text-muted-foreground">
                    {rand(data.money.spentCents)} of {rand(data.money.budgetCents)} budget
                  </p>
                </>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  Set a monthly budget to see how the month is going.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Notifications</CardTitle>
              <Link href="/notifications" className="text-sm font-medium text-sky hover:underline">
                View
              </Link>
            </CardHeader>
            <CardContent>
              {data.notifications.length === 0 ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Bell className="size-4 shrink-0" aria-hidden="true" />
                  You are all caught up.
                </div>
              ) : (
                <ul className="space-y-3">
                  {data.notifications.map((notification) => (
                    <li key={notification.id} className="text-sm">
                      <p className="font-medium">{notification.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{notification.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="pb-2 text-xs leading-5 text-muted-foreground">{dict.sampleDataFooter}</p>
    </div>
  );
}
