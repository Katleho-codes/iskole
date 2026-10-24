'use client';

import Link from 'next/link';
import { Users, FileText, ShieldCheck, Clock, UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/page-parts';

type AdminDashboardData = {
  pendingCompanies: number;
  openReports: number;
  userCount: number;
  recentAuditLogs: Array<{ id: string; action: string; entity: string; entityId: string | null; createdAt: string; actorId: string | null }>;
  recentUsers: Array<{ id: string; name: string; email: string; role: string; createdAt: string }>;
};

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[10px] bg-navy px-5 py-6 text-white sm:px-7 sm:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[58ch]">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/65">Admin Console</p>
            <h1 className="mt-2 text-[2rem] font-semibold leading-tight sm:text-[2.5rem]">System Overview</h1>
            <p className="mt-3 text-sm leading-6 text-white/80 sm:text-base">
              Manage users, companies, communities, reports and platform operations.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-start justify-between gap-4 pt-1">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Total Users</p>
              <p className="tabular mt-2 text-2xl font-semibold leading-none text-foreground">{data.userCount}</p>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-soft text-sky">
              <Users className="size-5" aria-hidden="true" />
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between gap-4 pt-1">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Pending Companies</p>
              <p className="tabular mt-2 text-2xl font-semibold leading-none text-foreground">{data.pendingCompanies}</p>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-protea-soft text-protea">
              <UserPlus className="size-5" aria-hidden="true" />
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between gap-4 pt-1">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Open Reports</p>
              <p className="tabular mt-2 text-2xl font-semibold leading-none text-foreground">{data.openReports}</p>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-soft text-amber">
              <FileText className="size-5" aria-hidden="true" />
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between gap-4 pt-1">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Quick Actions</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/company">Companies</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/moderation">Reports</Link>
                </Button>
              </div>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-leaf-soft text-leaf">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Users</CardTitle>
            <Link href="/profile" className="text-sm font-medium text-sky hover:underline">
              Manage
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentUsers.map((user) => (
                  <li key={user.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.name || user.email}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <StatusBadge status={user.role} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Audit Logs</CardTitle>
            <span className="text-xs text-muted-foreground">Last 10</span>
          </CardHeader>
          <CardContent>
            {data.recentAuditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit logs yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.recentAuditLogs.map((log) => (
                  <li key={log.id} className="flex items-start gap-2 text-sm">
                    <Clock className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="font-medium">{log.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.entity} {log.entityId ? `• ${log.entityId.slice(0, 8)}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
