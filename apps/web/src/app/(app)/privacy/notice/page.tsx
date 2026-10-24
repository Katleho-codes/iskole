import { PageHeader } from '@/components/page-parts';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = { title: 'Privacy notice' };

export default function PrivacyNoticePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Privacy notice" description="How iskole collects, uses and protects personal information." />
      <Card>
        <CardContent className="prose prose-sm max-w-none pt-1">
          <h2>What we collect</h2>
          <p>We collect only what is needed to help you plan your journey: profile details you provide, education marks, applications you create, and preferences you choose.</p>
          <h2>How we use it</h2>
          <p>Your data stays in your account. We use it to show your dashboard, match opportunities, track applications and provide tools like study planning.</p>
          <h2>Your rights (POPIA)</h2>
          <p>You can download your data, delete your account, see consent history, and change optional consents at any time from the Privacy centre.</p>
          <h2>Security</h2>
          <p>Access is role and ownership scoped. We log security events and keep audit trails for sensitive actions.</p>
        </CardContent>
      </Card>
    </div>
  );
}
