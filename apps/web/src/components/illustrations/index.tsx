/**
 * One original illustration set, kept deliberately small.
 *
 * Each drawing is inline SVG: no network request, no stock pack, no image budget. Navy line,
 * one sky or rose fill. `aria-hidden` because the adjacent heading carries the meaning.
 */
export type IllustrationName =
  | 'journey'
  | 'marks'
  | 'match'
  | 'funding'
  | 'applications'
  | 'calendar'
  | 'money'
  | 'wellness'
  | 'community'
  | 'privacy'
  | 'notifications'
  | 'empty';

type Props = {
  name: IllustrationName;
  className?: string;
};

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Illustration({ name, className }: Props) {
  return (
    <svg
      viewBox="0 0 120 96"
      role="presentation"
      aria-hidden="true"
      className={className ?? 'h-24 w-30 text-navy'}
    >
      <g {...common}>
        {name === 'journey' ? (
          <>
            <path d="M18 68c0-28 20-44 42-44s42 16 42 44" />
            <path d="M12 68h96" />
            <circle cx="42" cy="45" r="5" className="fill-protea-soft" />
            <path d="m40 45 1.6 1.6L45 43" />
            <circle cx="78" cy="34" r="5" className="fill-sky-soft" />
            <path d="M23 68c3-12 10-19 19-23M56 52c8-5 14-9 22-13" strokeDasharray="3 5" />
          </>
        ) : null}

        {name === 'marks' ? (
          <>
            <rect x="24" y="14" width="72" height="68" rx="6" className="fill-white" />
            <path d="M38 32h44M38 46h44M38 60h28" />
            <path d="M78 68h12M84 62v12" className="text-protea" />
            <path d="m44 28 5 5 8-9" className="text-leaf" />
          </>
        ) : null}

        {name === 'match' ? (
          <>
            <circle cx="50" cy="44" r="22" className="fill-sky-soft" />
            <circle cx="50" cy="44" r="9" className="fill-white" />
            <path d="m67 61 17 17" />
            <path d="m46 42 3 3 5-6" className="text-leaf" />
            <path d="M88 24 80 38l7-2 3 7 4-13z" className="fill-protea-soft text-protea" />
          </>
        ) : null}

        {name === 'funding' ? (
          <>
            <path d="M24 28h72v46H24z" className="fill-white" />
            <path d="M24 40h72" />
            <circle cx="60" cy="55" r="11" className="fill-amber-soft" />
            <path d="M57 55h6M60 51v8" className="text-amber" />
            <path d="M34 28V20h52v8" />
          </>
        ) : null}

        {name === 'applications' ? (
          <>
            <path d="M30 18h42l18 18v42H30z" className="fill-white" />
            <path d="M72 18v18h18" />
            <path d="M42 48h30M42 58h26M42 68h18" />
            <circle cx="80" cy="68" r="13" className="fill-leaf-soft" />
            <path d="m74 68 4 4 8-9" className="text-leaf" />
          </>
        ) : null}

        {name === 'calendar' ? (
          <>
            <rect x="22" y="22" width="76" height="60" rx="6" className="fill-white" />
            <path d="M22 38h76M40 16v12M80 16v12" />
            <path d="M38 50h12M56 50h12M74 50h12M38 64h12M56 64h12" />
            <rect x="72" y="58" width="18" height="12" rx="3" className="fill-protea-soft text-protea" />
          </>
        ) : null}

        {name === 'money' ? (
          <>
            <rect x="24" y="26" width="72" height="48" rx="6" className="fill-white" />
            <path d="M24 38h72M34 54h18M34 62h10" />
            <circle cx="76" cy="56" r="10" className="fill-leaf-soft" />
            <path d="M76 51v10M73 54h5a2 2 0 0 1 0 4h-4" className="text-leaf" />
          </>
        ) : null}

        {name === 'wellness' ? (
          <>
            <path d="M60 78S26 58 26 38a16 16 0 0 1 28-10l6 6 6-6a16 16 0 0 1 28 10c0 20-34 40-34 40z" className="fill-protea-soft text-protea" />
            <path d="M44 46h9l4-8 6 16 4-8h9" className="text-navy" />
          </>
        ) : null}

        {name === 'community' ? (
          <>
            <circle cx="44" cy="38" r="10" className="fill-sky-soft" />
            <circle cx="76" cy="42" r="8" className="fill-protea-soft" />
            <path d="M26 72c0-12 8-20 18-20s18 8 18 20M62 72c1-10 6-16 14-16s14 6 14 16" />
            <path d="M38 38h12M44 32v12" className="text-sky" />
          </>
        ) : null}

        {name === 'privacy' ? (
          <>
            <path d="M60 16 28 28v20c0 18 13 30 32 36 19-6 32-18 32-36V28z" className="fill-sky-soft" />
            <path d="M48 50v-8a12 12 0 0 1 24 0v8" />
            <rect x="44" y="50" width="32" height="22" rx="4" className="fill-white" />
            <path d="M60 59v5" />
          </>
        ) : null}

        {name === 'notifications' ? (
          <>
            <path d="M36 58V44a24 24 0 0 1 48 0v14l6 8H30z" className="fill-amber-soft text-amber" />
            <path d="M52 74a8 8 0 0 0 16 0" />
            <circle cx="82" cy="28" r="7" className="fill-protea text-protea" />
          </>
        ) : null}

        {name === 'empty' ? (
          <>
            <path d="M24 68c8-20 20-30 36-30s28 10 36 30" className="fill-sky-soft" />
            <path d="M18 68h84M42 58h12M54 48h14M68 58h10" />
            <circle cx="88" cy="30" r="6" className="fill-protea-soft text-protea" />
          </>
        ) : null}
      </g>
    </svg>
  );
}
