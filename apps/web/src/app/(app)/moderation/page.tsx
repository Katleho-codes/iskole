import { PageHeader, EmptyState } from '@/components/page-parts';

export const metadata = { title: 'Moderation' };

export default function ModerationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Moderation"
        description="Review reports and resolve them. Every action is logged to the audit trail."
      />
      <EmptyState
        illustration="community"
        title="Moderation queue"
        body="Use the moderation API to list and resolve reports. Role MODERATOR or ADMIN required."
        action={{ href: '/dashboard', label: 'Back to dashboard' }}
      />
    </div>
  );
}
