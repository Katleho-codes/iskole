import Link from 'next/link';
import { getDict } from '../i18n/strings';

// Landing screen. One primary action, plain language, text-first (low-data friendly).
const dict = getDict('en');

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <header>
        <span className="font-title text-2xl font-semibold text-ink">{dict.brand}</span>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-6 py-12">
        <h1 className="font-title text-4xl leading-tight text-ink-deep">{dict.heroTitle}</h1>
        <p className="max-w-[42ch] text-lg leading-relaxed text-muted">{dict.heroBody}</p>
        <div>
          <Link
            href="/signup"
            className="inline-block rounded-full bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-ink-deep"
          >
            {dict.getStarted}
          </Link>
        </div>
      </main>

      <footer className="border-t border-line pt-4 text-sm text-muted">{dict.sampleDataFooter}</footer>
    </div>
  );
}
