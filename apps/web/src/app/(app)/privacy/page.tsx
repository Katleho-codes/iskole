'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Section } from '@/components/page-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Consent = {
  id: string;
  purpose: string;
  policyVersion: string;
  grantedAt: string;
  revokedAt: string | null;
};

const PURPOSE_LABELS: Record<string, string> = {
  ESSENTIAL: 'Account and learning record',
  AI_STUDY_PLAN: 'AI study-plan assistance',
  TALENT_VISIBILITY: 'Talent visibility to companies',
};

export default function PrivacyPage() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/privacy/consents');
        if (res.ok) {
          const data = (await res.json()) as { consents: Consent[] };
          if (!cancelled) setConsents(data.consents);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateConsent(purpose: string, granted: boolean) {
    try {
      const res = await fetch('/api/privacy/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose, granted }),
      });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { consent?: Consent };
      setConsents((current) => {
        const closed = current.map((c) =>
          c.purpose === purpose && c.revokedAt === null ? { ...c, revokedAt: new Date().toISOString() } : c,
        );
        if (granted && data.consent) return [data.consent, ...closed];
        return closed;
      });
      toast.success(granted ? 'Consent granted' : 'Consent revoked');
    } catch {
      toast.error('Could not update consent');
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch('/api/privacy/export');
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'iskole-data-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Data export downloaded');
    } catch {
      toast.error('Could not export data');
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    try {
      const res = await fetch('/api/privacy/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (!res.ok) throw new Error('failed');
      toast.success('Account deleted');
      window.location.assign('/signin');
    } catch {
      toast.error('Could not delete account');
    }
  }

  const history = consents
    .slice()
    .sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime())
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Privacy and data"
        description="POPIA aligned. See what we store, change consent, download your data or delete your account."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-1">
            <Section title="Consent" description="Control optional data use. ESSENTIAL cannot be revoked.">
              <div className="space-y-3">
                {(['ESSENTIAL', 'AI_STUDY_PLAN', 'TALENT_VISIBILITY'] as const).map((purpose) => {
                  const active = history.find((c) => c.purpose === purpose && c.revokedAt === null);
                  const granted = purpose === 'ESSENTIAL' || Boolean(active);
                  return (
                    <div key={purpose} className="flex items-center justify-between gap-4 rounded-[10px] border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">{PURPOSE_LABELS[purpose]}</p>
                        <p className="text-xs text-muted-foreground">
                          {purpose === 'ESSENTIAL' ? 'Required for the service' : 'Optional'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`consent-${purpose}`} className="text-xs text-muted-foreground">
                          {granted ? 'Granted' : 'Revoked'}
                        </Label>
                        <Switch
                          id={`consent-${purpose}`}
                          checked={granted}
                          disabled={purpose === 'ESSENTIAL'}
                          onCheckedChange={(checked) => void updateConsent(purpose, checked)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-1">
            <Section title="Your rights" description="Export or delete as you choose.">
              <div className="flex flex-col gap-2">
                <Button onClick={() => void exportData()} disabled={exporting} className="justify-start">
                  <Download className="size-4" />
                  {exporting ? 'Exporting...' : 'Download my data'}
                </Button>
                <Button variant="outline" onClick={() => setDeleteOpen(true)} className="justify-start text-danger hover:text-danger">
                  <Trash2 className="size-4" />
                  Delete my account
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Deletion removes your account and related data. This action cannot be undone.
              </p>
            </Section>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-1">
          <Section title="Consent history" description="Append-only evidence of what you agreed to and when.">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No consent history yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 text-left font-medium">Purpose</th>
                      <th className="py-2 text-left font-medium">Version</th>
                      <th className="py-2 text-left font-medium">Action</th>
                      <th className="py-2 text-left font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c) => (
                      <tr key={c.id} className="border-b border-border/60">
                        <td className="py-2">{PURPOSE_LABELS[c.purpose] ?? c.purpose}</td>
                        <td className="py-2">{c.policyVersion}</td>
                        <td className="py-2">
                          {c.revokedAt ? <Badge variant="neutral">Revoked</Badge> : <Badge variant="leaf">Granted</Badge>}
                        </td>
                        <td className="py-2 text-muted-foreground">{new Date(c.grantedAt).toLocaleString('en-ZA')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-sky" aria-hidden="true" />
              <p className="text-sm font-medium">Learn more</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/privacy/notice">Privacy notice</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/privacy/terms">Terms</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/privacy/officer">Information officer</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/privacy/ai">How iskole uses AI</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        trigger={<span className="sr-only">Delete account</span>}
        title="Delete your account"
        description="This removes your account and related data. This action cannot be undone."
        confirmLabel="Delete account"
        confirmationWord="DELETE"
        onConfirm={() => deleteAccount()}
      />
    </div>
  );
}
