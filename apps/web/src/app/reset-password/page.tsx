import { Suspense } from 'react';
import Link from 'next/link';
import { ResetPasswordForm } from '../../components/reset-password-form';
import { getDict } from '../../i18n/strings';

const dict = getDict('en');

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <header>
        <Link href="/" className="font-title text-2xl font-semibold text-ink">
          {dict.brand}
        </Link>
      </header>
      <main className="flex flex-1 items-center py-12">
        <div className="w-full">
          {/* useSearchParams needs a Suspense boundary in the App Router. */}
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
