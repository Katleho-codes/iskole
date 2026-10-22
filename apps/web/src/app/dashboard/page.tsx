/**
 * Signed-in landing screen.
 *
 * Auth note: this page reads the session on the server by calling better-auth's own
 * endpoint through the internal API URL, forwarding the browser's cookies. It is a
 * convenience for rendering, not the security boundary: every piece of data below comes
 * from Express routes that re-check the session themselves. A forged render here would
 * show a layout, not data.
 *
 * The list below follows the journey: profile, marks, match, funding, apply, then a study
 * plan for after the offer. Each step reads and writes through the API, which owns the
 * authorization checks.
 */
import { headers } from 'next/headers';
import Link from 'next/link';
import { getDict } from '../../i18n/strings';

const dict = getDict('en');

type SessionUser = { name: string; email: string; role?: string };

async function getSession(): Promise<SessionUser | null> {
  const headerList = await headers();
  const cookie = headerList.get('cookie');
  if (!cookie) return null;

  try {
    const response = await fetch(`${process.env.API_INTERNAL_URL ?? 'http://localhost:4010'}/api/auth/get-session`, {
      headers: { cookie },
      // No caching: a stale session would show the wrong name or a signed-out state.
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { user?: SessionUser } | null;
    return data?.user ?? null;
  } catch {
    // The API being unreachable is not a reason to crash the page.
    return null;
  }
}

export default async function DashboardPage() {
  const user = await getSession();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
        <header>
          <Link href="/" className="font-title text-2xl font-semibold text-ink">
            {dict.brand}
          </Link>
        </header>
        <main className="flex flex-1 flex-col justify-center gap-6 py-12">
          <h1 className="font-title text-3xl text-ink-deep">{dict.signInTitle}</h1>
          <p className="text-muted">{dict.genericAuthError}</p>
          <Link
            href="/signin"
            className="inline-block w-fit rounded-full bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-ink-deep"
          >
            {dict.signIn}
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-title text-2xl font-semibold text-ink">
          {dict.brand}
        </Link>
        <span className="text-sm text-muted">{user.email}</span>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-6 py-12">
        <h1 className="font-title text-3xl leading-tight text-ink-deep">
          {dict.dashboardGreeting}, {user.name}
        </h1>
        <p className="text-muted">{dict.dashboardIntro}</p>
        
        <div className="flex flex-col gap-4">
          <Link
            href="/profile"
            className="rounded-lg border border-line bg-paper-raised p-4 transition-colors hover:bg-paper"
          >
            <h2 className="font-semibold text-ink-deep">1. Complete your profile</h2>
            <p className="text-sm text-muted">Add your personal details and preferences</p>
          </Link>
          
          <Link
            href="/marks"
            className="rounded-lg border border-line bg-paper-raised p-4 transition-colors hover:bg-paper"
          >
            <h2 className="font-semibold text-ink-deep">2. Add your subjects and marks</h2>
            <p className="text-sm text-muted">Enter your matric marks to calculate your APS</p>
          </Link>
          
          <Link
            href="/match"
            className="rounded-lg border border-line bg-paper-raised p-4 transition-colors hover:bg-paper"
          >
            <h2 className="font-semibold text-ink-deep">3. Find courses that match you</h2>
            <p className="text-sm text-muted">Get AI-powered course recommendations</p>
          </Link>
          
          <Link
            href="/funding"
            className="rounded-lg border border-line bg-paper-raised p-4 transition-colors hover:bg-paper"
          >
            <h2 className="font-semibold text-ink-deep">4. Explore funding options</h2>
            <p className="text-sm text-muted">Compare bursaries, scholarships and NSFAS</p>
          </Link>
          
          <Link
            href="/applications"
            className="rounded-lg border border-line bg-paper-raised p-4 transition-colors hover:bg-paper"
          >
            <h2 className="font-semibold text-ink-deep">5. Apply to courses</h2>
            <p className="text-sm text-muted">Submit applications and track their status</p>
          </Link>

          <Link
            href="/study-plan"
            className="rounded-lg border border-line bg-paper-raised p-4 transition-colors hover:bg-paper"
          >
            <h2 className="font-semibold text-ink-deep">6. Keep going with a study plan</h2>
            <p className="text-sm text-muted">
              Turn your marks into a weekly plan and add it to your calendar
            </p>
          </Link>
        </div>
      </main>

      <footer className="border-t border-line pt-4 text-sm text-muted">{dict.sampleDataFooter}</footer>
    </div>
  );
}
