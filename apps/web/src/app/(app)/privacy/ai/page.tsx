import { PageHeader } from '@/components/page-parts';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = { title: 'How iskole uses AI' };

export default function AIUsePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="How iskole uses AI" description="What is sent, what is not, and our guardrails." />
      <Card>
        <CardContent className="prose prose-sm max-w-none pt-1">
          <h2>What we use AI for</h2>
          <p>AI can help generate a study plan based on your modules, availability and goals. Where available, we use OpenRouter with strict privacy controls.</p>
          <h2>What is not sent</h2>
          <ul>
            <li>ID numbers, phone numbers or email addresses</li>
            <li>Full documents or sensitive health details</li>
            <li>Unnecessary personal identifiers</li>
          </ul>
          <h2>Guardrails</h2>
          <ul>
            <li>ZDR (zero data retention) where supported by the provider</li>
            <li>Provider data collection disabled</li>
            <li>No app attribution in prompts</li>
            <li>Structured outputs validated by Zod</li>
            <li>Deterministic fallbacks if AI is unavailable</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
