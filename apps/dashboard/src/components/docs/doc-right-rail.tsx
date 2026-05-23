import Link from 'next/link';
import type { DocMeta } from '../../lib/docs';

const PRODUCT_LINKS = [
  { href: '/app/connections', label: 'Connections' },
  { href: '/app/agents', label: 'Apps' },
  { href: '/app/policies', label: 'Policies' },
  { href: '/app/audit', label: 'Audit' },
  { href: '/app/swarms', label: 'Swarms' },
  { href: '/app/cloud', label: 'Cloud accounts' },
  { href: '/app/grants', label: 'Standing grants' },
  { href: '/app/settings/members', label: 'Members & invites' },
];

interface DocRightRailProps {
  doc: DocMeta;
  variant: 'in-app' | 'public';
}

export function DocRightRail({ doc, variant }: DocRightRailProps) {
  const productLinks = doc.product?.length ? doc.product : PRODUCT_LINKS.slice(0, 5);
  return (
    <aside className="col-span-12 lg:col-span-2 lg:sticky lg:top-24 lg:self-start">
      {variant === 'in-app' ? (
        <>
          <div className="eyebrow mb-3">jump to product</div>
          <ul className="space-y-2 text-sm">
            {productLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-aegis-mute transition-colors hover:text-aegis-paper"
                >
                  {l.label} →
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="eyebrow mb-3">try it</div>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href="/sign-up"
                className="text-aegis-signal underline-offset-2 hover:underline"
              >
                Create a free account →
              </Link>
            </li>
            <li>
              <Link
                href="/sign-in"
                className="text-aegis-mute transition-colors hover:text-aegis-paper"
              >
                Sign in →
              </Link>
            </li>
          </ul>
        </>
      )}
      {doc.readMinutes ? (
        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
          ~{doc.readMinutes} min read
        </p>
      ) : null}
    </aside>
  );
}
