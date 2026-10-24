'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader, EmptyState } from '@/components/page-parts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FIELDS_OF_STUDY } from '@iskole/shared';

type Community = {
  id: string;
  name: string;
  description: string | null;
  field: string | null;
  messageCount?: number;
  memberCount?: number;
  joined?: boolean;
  recommended?: boolean;
};

type User = {
  role?: string;
};

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [user, setUser] = useState<User>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', field: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [commRes, sessionRes] = await Promise.all([fetch('/api/communities'), fetch('/api/auth/get-session')]);
      if (commRes.ok) {
        const data = await commRes.json();
        setCommunities(data.communities || []);
      }
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        setUser(session.user || {});
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function createCommunity() {
    setSaving(true);
    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          field: form.field || undefined,
        }),
      });
      if (res.ok) {
        setCreateOpen(false);
        setForm({ name: '', description: '', field: '' });
        load();
      }
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function deleteCommunity(id: string) {
    if (!confirm('Delete this community?')) return;
    try {
      await fetch(`/api/communities/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      // ignore
    }
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'MODERATOR';
  const recommended = communities.filter((c) => c.recommended);
  const others = communities.filter((c) => !c.recommended);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Communities" description="Loading..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communities"
        description={isAdmin ? 'Manage communities and see recommendations.' : 'Peer spaces by field of study. Recommendations based on your preferences.'}
        action={
          isAdmin ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button variant="default">Create Community</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Community</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="field">Field of Study</Label>
                    <Select value={form.field || undefined} onValueChange={(value) => setForm({ ...form, field: value })}>
                      <SelectTrigger id="field">
                        <SelectValue placeholder="Select a field" />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELDS_OF_STUDY.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={createCommunity} disabled={saving || !form.name}>
                    {saving ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {communities.length === 0 ? (
        <EmptyState
          illustration="community"
          title="No communities yet"
          body="Communities may be created by admins. Join one when available to ask questions and learn."
          action={{ href: '/dashboard', label: 'Back to dashboard' }}
        />
      ) : (
        <>
          {recommended.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Recommended for you</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {recommended.map((c) => (
                  <Card key={c.id} className="border-primary/50">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{c.name}</span>
                        <div className="flex items-center gap-2">
                          {c.field ? <Badge variant="sky">{c.field}</Badge> : null}
                          <Badge variant="default">Recommended</Badge>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {c.description ? <p className="text-sm text-muted-foreground">{c.description}</p> : null}
                      <p className="text-xs text-muted-foreground">{c.messageCount ?? c.memberCount ?? 0} messages</p>
                      <div className="flex gap-2">
                        <Button asChild variant={c.joined ? 'outline' : 'default'} size="sm">
                          <Link href={`/communities/${c.id}`}>{c.joined ? 'Open' : 'View / Join'}</Link>
                        </Button>
                        {isAdmin && (
                          <Button variant="destructive" size="sm" onClick={() => deleteCommunity(c.id)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">{recommended.length > 0 ? 'All Communities' : 'Communities'}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {others.map((c) => (
                  <Card key={c.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{c.name}</span>
                        {c.field ? <Badge variant="sky">{c.field}</Badge> : null}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {c.description ? <p className="text-sm text-muted-foreground">{c.description}</p> : null}
                      <p className="text-xs text-muted-foreground">{c.messageCount ?? c.memberCount ?? 0} messages</p>
                      <div className="flex gap-2">
                        <Button asChild variant={c.joined ? 'outline' : 'default'} size="sm">
                          <Link href={`/communities/${c.id}`}>{c.joined ? 'Open' : 'View / Join'}</Link>
                        </Button>
                        {isAdmin && (
                          <Button variant="destructive" size="sm" onClick={() => deleteCommunity(c.id)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
