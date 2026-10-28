import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Illustration, type IllustrationName } from '@/components/illustrations';

export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-2 text-xs text-muted-foreground">{breadcrumb}</div> : null}
        <h1 className="text-[1.75rem] font-semibold leading-tight text-foreground sm:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[70ch] text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {title || action ? (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            {title ? <h2 className="text-lg font-semibold text-foreground">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'rose' | 'sky' | 'leaf' | 'amber';
}) {
  const toneClass = {
    default: 'bg-secondary text-primary',
    rose: 'bg-protea-soft text-protea',
    sky: 'bg-sky-soft text-sky',
    leaf: 'bg-leaf-soft text-leaf',
    amber: 'bg-amber-soft text-amber',
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 pt-1">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
          <p className="tabular mt-2 text-2xl font-semibold leading-none text-foreground">{value}</p>
          {hint ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
            <Icon className="size-5" aria-hidden="true" />
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}

export type StatusTone = 'default' | 'neutral' | 'leaf' | 'amber' | 'sky' | 'danger';

const STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'sky' },
  UNDER_REVIEW: { label: 'Under review', tone: 'amber' },
  OFFER_ISSUED: { label: 'Offer issued', tone: 'leaf' },
  ACCEPTED: { label: 'Accepted', tone: 'leaf' },
  DECLINED: { label: 'Declined', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
  REJECTED: { label: 'Not successful', tone: 'danger' },
  PENDING: { label: 'Pending', tone: 'amber' },
  CONFIRMED: { label: 'Confirmed', tone: 'leaf' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  BOOKED: { label: 'Booked', tone: 'leaf' },
  HIDDEN: { label: 'Hidden', tone: 'neutral' },
  VISIBLE: { label: 'Visible to companies', tone: 'sky' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const normalised = status.toUpperCase().replaceAll(' ', '_');
  const match = STATUS_LABELS[normalised];
  const label = match?.label ?? status.replaceAll('_', ' ').toLowerCase();
  const tone = match?.tone ?? 'neutral';

  return (
    <Badge variant={tone} className={className}>
      {label}
    </Badge>
  );
}

export function EmptyState({
  illustration = 'empty',
  title,
  body,
  action,
  secondary,
  compact = false,
}: {
  illustration?: IllustrationName;
  title: string;
  body: string;
  action?: { href: string; label: string };
  secondary?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[10px] border border-dashed border-border bg-card text-center ${
        compact ? 'px-5 py-8' : 'px-6 py-12'
      }`}
    >
      <Illustration name={illustration} className="h-20 w-24 text-navy" />
      <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-[46ch] text-sm leading-6 text-muted-foreground">{body}</p>
      {action ? (
        <Button asChild variant="accent" className="mt-5">
          <Link href={action.href}>
            {action.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
      {secondary ? <div className="mt-3">{secondary}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'That did not load',
  body = 'Something went wrong on our side. Try again in a moment.',
  retryHref,
}: {
  title?: string;
  body?: string;
  retryHref?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-[10px] border border-danger/25 bg-danger-soft/50 px-6 py-10 text-center"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-card text-danger dark:bg-muted">
        <AlertCircle className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-3 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-[46ch] text-sm leading-6 text-muted-foreground">{body}</p>
      {retryHref ? (
        <Button asChild variant="outline" className="mt-4">
          <Link href={retryHref}>Try again</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-[10px] border border-border bg-card p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span className="ml-1 text-protea" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs leading-5 text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-5 text-muted-foreground" id={htmlFor ? `${htmlFor}-hint` : undefined}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
