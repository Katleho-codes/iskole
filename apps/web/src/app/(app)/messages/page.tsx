import { PageHeader, EmptyState } from '@/components/page-parts';

export const metadata = { title: 'Messages' };

export default function MessagesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Direct 1:1 conversations with block and under-18 safeguards enforced."
      />
      <EmptyState
        illustration="notifications"
        title="Direct messages"
        body="Create and view conversations via the API. Block and age restrictions are enforced server-side."
        action={{ href: '/communities', label: 'Browse communities' }}
      />
    </div>
  );
}
