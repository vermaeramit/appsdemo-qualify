import { site } from '../config';

/** The product mark (same as the dashboard's favicon) with the product name. */
export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={inverted ? '#fff' : '#4f46e5'} />
        <path
          d="M9 16.5l4.5 4.5L23 11.5"
          fill="none"
          stroke={inverted ? '#4f46e5' : '#fff'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={`text-[1.05rem] leading-none font-semibold tracking-tight ${inverted ? 'text-white' : 'text-ink'}`}
      >
        {site.productName}
      </span>
    </span>
  );
}
