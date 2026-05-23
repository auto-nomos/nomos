'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { DocMeta, JourneyMeta } from '../../lib/docs';
import { cn } from '../../lib/utils';

interface DocNavProps {
  docs: DocMeta[];
  journeys: JourneyMeta[];
  basePath: '/docs' | '/app/guide';
}

export function DocNav({ docs, journeys, basePath }: DocNavProps) {
  const pathname = usePathname();
  const currentSlug = pathname?.replace(`${basePath}/`, '') ?? '';

  return (
    <nav className="col-span-12 lg:col-span-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
      <div className="eyebrow mb-3">documentation</div>
      {journeys.map((journey) => {
        const items = docs.filter((d) => d.journey === journey.id);
        if (items.length === 0) return null;
        return (
          <div key={journey.id} className="mb-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
              {journey.label}
            </div>
            <ul className="mt-2 space-y-1">
              {items.map((doc) => {
                const href = `${basePath}/${doc.slug.join('/')}`;
                const isActive = currentSlug === doc.slug.join('/');
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        'group flex items-center justify-between gap-2 border-l border-aegis-line py-1.5 pl-3 text-sm transition-colors',
                        isActive
                          ? 'border-aegis-signal text-aegis-paper'
                          : 'text-aegis-mute hover:border-aegis-line-strong hover:text-aegis-paper',
                      )}
                    >
                      <span className="truncate">{doc.title}</span>
                      {doc.badge ? (
                        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-aegis-signal">
                          {doc.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
