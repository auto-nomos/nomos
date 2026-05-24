import { ArrowUpRight, FileLock2, Hash, KeyRound } from 'lucide-react';
import Link from 'next/link';

/**
 * Band 4 — The Nomos answer. One idea: three primitives, one page of code.
 * Three-column diagram: Mint UCAN → Decide with Cedar → Record on chain.
 */
const PRIMITIVES: {
  step: string;
  icon: typeof KeyRound;
  name: string;
  body: string;
  pkg: string;
  href: string;
}[] = [
  {
    step: '01',
    icon: KeyRound,
    name: 'Mint UCAN',
    body: 'A capability token scoped to one resource, one action, expires in seconds. Agent holds the token; the secret stays with us.',
    pkg: '@auto-nomos/ucan',
    href: '/docs#ucan',
  },
  {
    step: '02',
    icon: FileLock2,
    name: 'Decide with Cedar',
    body: 'AWS-grade policy language. Deterministic, formally verifiable, fail-closed. Visual builder round-trips to the same text.',
    pkg: '@auto-nomos/cedar',
    href: '/docs#policies',
  },
  {
    step: '03',
    icon: Hash,
    name: 'Record on chain',
    body: 'Every decision hashed into a prev-linked chain. Daily roots Ed25519-signed. Verify offline with our CLI, forever.',
    pkg: '@auto-nomos/audit-verify',
    href: '/docs#audit',
  },
];

export function Answer() {
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28 md:px-10 md:py-32">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12">
            <div className="eyebrow">the answer</div>
            <h2 className="display mt-5 max-w-[22ch] text-[36px] leading-[1.05] text-aegis-paper sm:text-[44px] md:text-[56px] md:leading-[1.02] lg:text-[64px]">
              Three primitives.
              <br />
              <em>One page</em> of code.
            </h2>
            <p className="mt-6 max-w-[680px] text-base leading-relaxed text-aegis-mute">
              Nomos doesn&rsquo;t add another orchestration framework. It adds three primitives
              between your agent and its tools: a capability mint, a policy decision, and a signed
              audit. Use one. Use all three. Drop in tomorrow without rewriting your stack.
            </p>
          </div>
          <div className="col-span-12">
            <ol className="grid grid-cols-1 gap-px bg-aegis-line md:grid-cols-3">
              {PRIMITIVES.map((p) => (
                <li
                  key={p.step}
                  className="group bg-aegis-ink p-6 transition-colors hover:bg-aegis-surface/60 sm:p-8"
                >
                  <div className="flex items-baseline justify-between">
                    <div className="font-display text-[24px] text-aegis-signal sm:text-[28px]">
                      {p.step}
                    </div>
                    <p.icon className="h-5 w-5 text-aegis-paper" aria-hidden />
                  </div>
                  <h3 className="display mt-6 text-[22px] leading-tight text-aegis-paper sm:text-[28px]">
                    {p.name}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-aegis-mute">{p.body}</p>
                  <Link
                    href={p.href}
                    className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] text-aegis-mute transition-colors group-hover:text-aegis-signal"
                  >
                    <span className="rounded-sm border border-aegis-line bg-aegis-surface px-2 py-0.5">
                      {p.pkg}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
