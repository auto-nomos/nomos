import Link from 'next/link';
import type { DocMeta } from '../../lib/docs';
import { DocNav } from './doc-nav';
import { DocRightRail } from './doc-right-rail';

interface DocShellProps {
  doc: DocMeta;
  docs: DocMeta[];
  journeys: { id: DocMeta['journey']; label: string; description: string }[];
  prev?: DocMeta;
  next?: DocMeta;
  basePath: '/docs' | '/app/guide';
  children: React.ReactNode;
}

export function DocShell({ doc, docs, journeys, prev, next, basePath, children }: DocShellProps) {
  const variant = basePath === '/app/guide' ? 'in-app' : 'public';
  return (
    <div className="mx-auto max-w-[1600px] px-6 py-12 md:px-10 md:py-16">
      <div className="grid grid-cols-12 gap-8">
        <DocNav docs={docs} journeys={journeys} basePath={basePath} />
        <article className="col-span-12 lg:col-span-7">
          <header className="border-b border-aegis-line pb-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
              {journeys.find((j) => j.id === doc.journey)?.label ?? 'Docs'}
            </div>
            <h1 className="display mt-3 text-[40px] leading-tight text-aegis-paper">{doc.title}</h1>
            {doc.description ? (
              <p className="mt-3 text-[15px] leading-relaxed text-aegis-mute">{doc.description}</p>
            ) : null}
          </header>
          <div className="prose-aegis mt-8 space-y-5">{children}</div>
          <nav className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line">
            <div className="bg-aegis-ink p-5">
              {prev ? (
                <Link
                  href={`${basePath}/${prev.slug.join('/')}`}
                  className="group flex flex-col gap-1 text-left"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                    ← Previous
                  </span>
                  <span className="font-display text-[16px] text-aegis-paper group-hover:text-aegis-signal">
                    {prev.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
            </div>
            <div className="bg-aegis-ink p-5 text-right">
              {next ? (
                <Link
                  href={`${basePath}/${next.slug.join('/')}`}
                  className="group inline-flex flex-col items-end gap-1"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                    Next →
                  </span>
                  <span className="font-display text-[16px] text-aegis-paper group-hover:text-aegis-signal">
                    {next.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
            </div>
          </nav>
        </article>
        <DocRightRail doc={doc} variant={variant} />
      </div>
    </div>
  );
}
