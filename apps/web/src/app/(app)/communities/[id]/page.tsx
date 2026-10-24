import Link from 'next/link';
import { PageHeader } from '@/components/page-parts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { serverApi } from '@/lib/server-api';

export const metadata = { title: 'Community' };

type Message = { id: string; body: string; createdAt: string; authorName: string };

export default async function CommunityRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [commRes, msgRes] = await Promise.all([
    serverApi<any>('/api/communities'),
    serverApi<{ messages: Message[] }>(`/api/communities/${id}/messages?limit=50`),
  ]);

  const community = commRes.ok ? (commRes.data?.communities || []).find((c: any) => c.id === id) : null;
  const messages = msgRes.ok ? msgRes.data?.messages ?? [] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={community?.name ?? 'Community'}
        description={community?.description ?? 'Community room'}
        action={<Button asChild variant="outline" size="sm"><Link href="/communities">Back</Link></Button>}
      />
      <Card>
        <CardContent className="space-y-4 pt-6">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li key={m.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{m.authorName}</span>
                    <span className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-sm">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Posting and reporting are available via API. SSE updates at /api/messages/stream.</p>
        </CardContent>
      </Card>
    </div>
  );
}
