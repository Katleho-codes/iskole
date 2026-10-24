'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, EmptyState, Section } from '@/components/page-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = (await res.json()) as { notifications: Notification[]; unread: number };
          if (!cancelled) {
            setNotifications(data.notifications);
            setUnread(data.unread);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function markRead(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { notification: { id: string; readAt: string }; unread: number };
      setNotifications((current) => current.map((n) => (n.id === id ? { ...n, readAt: data.notification.readAt } : n)));
      setUnread(data.unread);
    } catch {
      toast.error('Could not mark as read');
    }
  }

  async function markAllRead() {
    setMarking(true);
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      setNotifications((current) => current.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setUnread(0);
      toast.success('All marked as read');
    } catch {
      toast.error('Could not mark all as read');
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Deadlines, offers and nudges that matter."
        action={
          unread > 0 ? (
            <Button variant="outline" size="sm" onClick={() => void markAllRead()} disabled={marking}>
              <CheckCheck className="size-4" />
              {marking ? 'Marking...' : 'Mark all read'}
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="pt-1">
          <Section title="Updates" description={unread > 0 ? `${unread} unread` : 'All caught up'}>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : notifications.length === 0 ? (
              <EmptyState illustration="notifications" title="You're all caught up" body="When something needs your attention, it will appear here." compact />
            ) : (
              <ul className="divide-y divide-border/60">
                {notifications.map((notification) => (
                  <li key={notification.id} className={`flex gap-3 py-3 ${notification.readAt ? '' : 'bg-accent/30'}`}>
                    <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Bell className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{notification.title}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</span>
                          {!notification.readAt ? <Badge variant="sky">New</Badge> : null}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {notification.href ? (
                          <Button asChild variant="link" className="h-auto px-0 text-sm">
                            <Link href={notification.href}>View</Link>
                          </Button>
                        ) : null}
                        {!notification.readAt ? (
                          <Button variant="link" className="h-auto px-0 text-sm" onClick={() => void markRead(notification.id)}>
                            Mark as read
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </CardContent>
      </Card>
    </div>
  );
}
