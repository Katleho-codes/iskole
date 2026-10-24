import { PageHeader } from '@/components/page-parts';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = { title: 'Information officer' };

export default function InformationOfficerPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Information officer" description="POPIA contact placeholder." />
      <Card>
        <CardContent className="prose prose-sm max-w-none pt-1">
          <h2>Contact</h2>
          <p><strong>Information Officer:</strong> iskole (demo)</p>
          <p><strong>Email:</strong> privacy@iskole.demo</p>
          <p><strong>Address:</strong> Johannesburg, South Africa</p>
          <p>This is a placeholder for the hackathon submission. In production, use the registered information officer details.</p>
        </CardContent>
      </Card>
    </div>
  );
}
