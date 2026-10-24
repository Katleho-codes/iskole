import { notFound } from 'next/navigation';
import { CalendarDays, FileText, Wallet } from 'lucide-react';
import { PageHeader, Section, StatCard, StatusBadge, EmptyState, FormField, SkeletonList } from '@/components/page-parts';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

export const metadata = { title: 'Design system' };

const swatches = [
  { name: 'background', value: '#F3F5F9', className: 'bg-background' },
  { name: 'surface', value: '#FFFFFF', className: 'bg-card' },
  { name: 'ink', value: '#16203A', className: 'bg-navy' },
  { name: 'ink-muted', value: '#5A6480', className: 'bg-muted-foreground' },
  { name: 'line', value: '#E0E5EF', className: 'bg-border' },
  { name: 'accent', value: '#C42B5B', className: 'bg-protea' },
  { name: 'accent-soft', value: '#FBE7EE', className: 'bg-protea-soft' },
  { name: 'sky', value: '#2F6FB5', className: 'bg-sky' },
  { name: 'leaf', value: '#1F8A5B', className: 'bg-leaf' },
  { name: 'amber', value: '#B7791F', className: 'bg-amber' },
  { name: 'danger', value: '#B3261E', className: 'bg-danger' },
];

export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Design system"
        description="The working kit for every screen. Light mode only. Rose marks the one main action per screen; semantic colours only carry status."
        action={<Badge variant="sky">Dev only</Badge>}
      />

      <Section title="Colour" description="Navy does the structure. Text pairings are checked for AA.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {swatches.map((swatch) => (
            <div key={swatch.name} className="overflow-hidden rounded-[10px] border border-border bg-card">
              <div className={`h-16 ${swatch.className}`} />
              <div className="p-3">
                <p className="text-xs font-semibold text-foreground">{swatch.name}</p>
                <p className="tabular mt-0.5 text-[11px] text-muted-foreground">{swatch.value}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography" description="Montserrat headings, Cabin body. 12 / 14 / 16 / 18 / 22 / 28 / 40.">
        <Card>
          <CardContent className="space-y-4 pt-1">
            <p className="font-heading text-4xl font-semibold leading-tight">Good morning, Thandi</p>
            <p className="font-heading text-[1.75rem] font-semibold">Your next step</p>
            <p className="font-heading text-[1.375rem] font-semibold">Section heading</p>
            <p className="text-lg leading-7 text-foreground">Lead paragraph for a short explanation.</p>
            <p className="max-w-[70ch] text-base leading-7">
              Body copy stays under 75 characters per line. This is where a learner reads what a
              course needs, what a bursary covers and what happens next.
            </p>
            <p className="text-sm text-muted-foreground">Secondary UI text and table copy.</p>
            <p className="tabular text-2xl font-semibold">R 52 400.00</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Actions" description="40 px default height, 10 px radius, 2 px sky focus ring.">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-1">
            <Button>Primary</Button>
            <Button variant="accent">Main action</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Calendar">
              <CalendarDays className="size-4" />
            </Button>
          </CardContent>
        </Card>
      </Section>

      <Section title="Forms" description="Labels are always visible above the field. 44 px controls for touch.">
        <Card>
          <CardContent className="grid gap-5 pt-1 sm:grid-cols-2">
            <FormField label="Full name" htmlFor="demo-name" hint="As it appears on your school record." required>
              <Input id="demo-name" placeholder="Thandi Mokoena" />
            </FormField>
            <FormField label="Email address" htmlFor="demo-email" error="Enter a valid email address." required>
              <Input id="demo-email" type="email" defaultValue="not-an-email" aria-invalid="true" />
            </FormField>
            <FormField label="Why this course?" htmlFor="demo-why" className="sm:col-span-2">
              <Textarea id="demo-why" rows={3} placeholder="A sentence or two." />
            </FormField>
          </CardContent>
        </Card>
      </Section>

      <Section title="Status" description="Never colour alone: every badge carries a label.">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 pt-1">
            {['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'OFFER_ISSUED', 'ACCEPTED', 'DECLINED'].map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
            <Badge variant="leaf">Funded</Badge>
            <Badge variant="amber">Closes soon</Badge>
            <Badge variant="sky">Information</Badge>
            <Badge variant="danger">Over budget</Badge>
            <Badge variant="neutral">Neutral</Badge>
          </CardContent>
        </Card>
      </Section>

      <Section title="Stats and progress" description="Numbers are tabular. Colour is paired with text.">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="APS" value="38" hint="Six subjects counted" icon={FileText} />
          <StatCard label="Saved funding" value="3" hint="R 52 400 average" icon={Wallet} tone="rose" />
          <StatCard label="Study this week" value="4 / 6" hint="Blocks completed" icon={CalendarDays} tone="leaf" />
        </div>
        <Card className="mt-3">
          <CardContent className="space-y-4 pt-1">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Profile completeness</span>
                <span className="tabular text-muted-foreground">75%</span>
              </div>
              <Progress value={75} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Budget used</span>
                <span className="tabular text-muted-foreground">R 3 200 of R 4 000</span>
              </div>
              <Progress value={80} className="[&>[data-slot=progress-indicator]]:bg-amber" />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Tabs, empty and loading states">
        <Tabs defaultValue="empty">
          <TabsList>
            <TabsTrigger value="empty">Empty</TabsTrigger>
            <TabsTrigger value="loading">Loading</TabsTrigger>
            <TabsTrigger value="error">Error</TabsTrigger>
          </TabsList>
          <TabsContent value="empty" className="pt-3">
            <EmptyState
              illustration="applications"
              title="No applications yet"
              body="When you find a course and funding you like, apply in one place."
              action={{ href: '/match', label: 'Find a course' }}
            />
          </TabsContent>
          <TabsContent value="loading" className="pt-3">
            <SkeletonList rows={3} />
          </TabsContent>
          <TabsContent value="error" className="pt-3">
            <Card>
              <CardHeader>
                <CardTitle>Something went wrong</CardTitle>
                <CardDescription>Say what happened, then give one retry.</CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Dialog" description="Destructive actions name the thing and use a typed confirmation.">
        <ConfirmDialog
          trigger={<Button variant="destructive">Delete example</Button>}
          title="Delete this example?"
          description="This is a demo item. Nothing real is deleted."
          confirmationWord="DELETE"
          confirmLabel="Delete example"
          onConfirm={() => undefined}
        />
      </Section>
    </div>
  );
}
