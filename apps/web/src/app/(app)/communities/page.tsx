import Link from 'next/link';
import { PageHeader, EmptyState } from '@/components/page-parts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { serverApi } from '@/lib/server-api';

export const metadata = { title: 'Communities' };

type Community = { id: string; name: string; description: string | null; field: string | null; memberCount: number; joined: boolean };

export default async function CommunitiesPage() {
  const result = await serverApi<{ communities: Community[] }>('/api/communities');
  const communities = result.ok ? result.data?.communities ?? [] : [];

  if (communities.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Communities"
          description="Peer spaces by field of study. Reports and moderation keep spaces safe."
        />
        <EmptyState
          illustration="community"
          title="No communities yet"
          body="Communities may be created by admins. Join one when available to ask questions and learn."
          action={{ href: '/dashboard', label: 'Back to dashboard' }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communities"
        description="Read and post in your field-based communities."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {communities.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{c.name}</span>
                {c.field ? <Badge variant="sky">{c.field}</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {c.description ? <p className="text-sm text-muted-foreground">{c.description}</p> : null}
              <p className="text-xs text-muted-foreground">{c.memberCount} member{c.memberCount === 1 ? '' : 's'}</p>
              <Button asChild variant={c.joined ? 'outline' : 'accent'} size="sm">
                <Link href={`/communities/${c.id}`}>{c.joined ? 'Open' : 'View / Join'}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
