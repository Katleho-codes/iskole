import { PageHeader, EmptyState } from '@/components/page-parts';

export const metadata = { title: 'Communities' };

export default function CommunitiesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Communities"
        description="Read-only spaces to ask questions and learn from others. Reports and moderation keep spaces safe."
      />
      <EmptyState
        illustration="community"
        title="Communities are coming"
        body="We are building read-only communities with safe reporting first."
        action={{ href: '/dashboard', label: 'Back to dashboard' }}
      />
    </div>
  );
}
