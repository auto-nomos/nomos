import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '../../lib/utils';

export function ChartCard({
  title,
  subtitle,
  href,
  cta,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  cta?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        'col-span-12 overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface lg:col-span-6',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-aegis-line px-6 py-4">
        <div>
          {subtitle ? <div className="eyebrow">{subtitle}</div> : null}
          <h2 className="mt-1 font-display text-xl text-aegis-paper">{title}</h2>
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:text-aegis-paper"
          >
            {cta ?? 'open'}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      <div className="px-2 py-4 sm:px-4">{children}</div>
    </article>
  );
}

export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[260px] items-center justify-center px-6 text-center text-sm text-aegis-mute">
      {children}
    </div>
  );
}

export function ChartSkeleton() {
  return <div className="h-[260px] animate-pulse rounded-sm bg-aegis-surface-2/50" />;
}
