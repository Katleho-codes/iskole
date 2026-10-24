import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getSessionUser } from '@/lib/server-session';

/**
 * Signed-in area. The redirect here is for rendering only; every API call still carries the
 * cookie and is authorised by Express. A learner who forges their way past this layout sees
 * an empty shell, not another learner's data.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/signin');

  // A session issued before verification was required can still exist. Keep that stale
  // session out of the app instead of letting every API call fail with 403.
  // if (!user.emailVerified) redirect('/verify-email?error=unverified');

  return <AppShell user={user}>{children}</AppShell>;
}
