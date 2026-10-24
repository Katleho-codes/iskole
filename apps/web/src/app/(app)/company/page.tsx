import { PageHeader, EmptyState } from '@/components/page-parts';

export const metadata = { title: 'Company talent search' };

export default function CompanyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Talent search"
        description="Search learner profiles that have opted in. Only approved companies can access candidates."
      />
      <EmptyState
        illustration="community"
        title="Company access"
        body="Candidates are filtered to opted-in learners aged 18+ with no contact details exposed. Connection requests require approval."
        action={{ href: '/dashboard', label: 'Back to dashboard' }}
      />
    </div>
  );
}
