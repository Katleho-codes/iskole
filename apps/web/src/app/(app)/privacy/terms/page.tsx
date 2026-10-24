import { PageHeader } from '@/components/page-parts';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = { title: 'Terms of use' };

export default function TermsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Terms of use" description="Using iskole responsibly." />
      <Card>
        <CardContent className="prose prose-sm max-w-none pt-1">
          <h2>Purpose</h2>
          <p>iskole is a student dashboard for planning, funding discovery and applications. Content is provided for guidance only.</p>
          <h2>Simulated data</h2>
          <p>Offers, institutions and some opportunities are simulated for demonstration. Always confirm with the real provider.</p>
          <h2>Your account</h2>
          <p>You are responsible for keeping your login details secure. Do not share sensitive documents unnecessarily.</p>
        </CardContent>
      </Card>
    </div>
  );
}
