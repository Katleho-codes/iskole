import Link from 'next/link';
import { SignUpForm } from '../../components/sign-up-form';
import { getDict } from '../../i18n/strings';

const dict = getDict('en');

export default function SignUpPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <header>
        <Link href="/" className="font-title text-2xl font-semibold text-ink">
          {dict.brand}
        </Link>
      </header>
      <main className="flex flex-1 items-center py-12">
        <div className="w-full">
          <SignUpForm />
        </div>
      </main>
    </div>
  );
}
