import { PageHeader, EmptyState } from '@/components/page-parts';

export const metadata = { title: 'Messages' };

export default function MessagesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Direct messages are disabled for this build." />
      <EmptyState
        illustration="notifications"
        title="No messages"
        body="Messaging is turned off to reduce risk. Use applications and offers to track contact."
        action={{ href: '/dashboard', label: 'Back to dashboard' }}
      />
    </div>
  );
}
