import Link from 'next/link';
import { cn } from '../lib/utils';

export type MetricAccent = 'paper' | 'signal' | 'iris' | 'coral';

const ACCENT_CLASS: Record<MetricAccent, string> = {
  paper: 'text-aegis-paper',
  signal: 'text-aegis-signal',
  iris: 'text-aegis-iris',
  coral: 'text-aegis-coral',
};

export function MetricTile({
  icon: Icon,
  label,
  value,
  unit,
  href,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit: string;
  href?: string;
  accent: MetricAccent;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Icon className="h-4 w-4 text-aegis-faint" />
      </div>
      <div className="mt-7">
        <div className={cn('font-display text-[48px] leading-none', ACCENT_CLASS[accent])}>
          {value}
        </div>
        <div className="mt-2 font-mono text-[11px] uppercase tracking-wider text-aegis-mute">
          {unit}
        </div>
      </div>
    </>
  );
  const className =
    'col-span-12 flex flex-col justify-between bg-aegis-surface p-6 transition-colors hover:bg-aegis-surface-2 sm:col-span-6 lg:col-span-3';
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

export function fmtCount(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—';
  return n.toString().padStart(2, '0');
}
