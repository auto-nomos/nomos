/* ======================================================================
   Nomos — auth shell
   ----------------------------------------------------------------------
   Split-pane container shared by sign-in / sign-up. Left side is an
   editorial brand panel (logo + headline + ambient pulse). Right side
   hosts the form. On small screens the brand panel collapses to a slim
   header so we don't waste viewport on marketing during a login.
   ====================================================================== */

import Link from 'next/link';
import { NomosLogo } from './logo';

interface Props {
  eyebrow: string;
  title: React.ReactNode;
  copy: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ eyebrow, title, copy, children, footer }: Props) {
  return (
    <div className="relative z-10 grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col justify-between border-r border-aegis-line bg-aegis-surface/40 p-10 backdrop-blur lg:flex">
        <Link href="/" aria-label="Nomos home">
          <NomosLogo size={28} />
        </Link>

        <div data-stagger>
          <div className="eyebrow flex items-center gap-3">
            <span className="pulse" />
            <span>{eyebrow}</span>
          </div>
          <h1 className="display mt-7 max-w-[18ch] text-[64px] leading-[0.95] text-aegis-paper">
            {title}
          </h1>
          <p className="mt-7 max-w-[420px] text-sm leading-relaxed text-aegis-mute">{copy}</p>
          <ul className="mt-10 space-y-3 font-mono text-xs uppercase tracking-[0.18em] text-aegis-faint">
            <li>· UCAN delegation</li>
            <li>· Cedar policy gates</li>
            <li>· WebAuthn step-up</li>
            <li>· Hash-chained audit</li>
          </ul>
        </div>

        <div className="rounded-sm border border-aegis-line bg-aegis-ink/60 p-5">
          <div className="eyebrow mb-3">field log</div>
          <p className="font-mono text-[11px] leading-relaxed text-aegis-mute">
            “Nomos closed the gap between &lsquo;the agent could&rsquo; and &lsquo;the agent
            did&rsquo;. We replay every decision before shipping a policy change.”
          </p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            — staff eng · platform team
          </p>
        </div>
      </aside>

      <main className="relative flex flex-col">
        <header className="flex h-16 items-center justify-between border-b border-aegis-line px-6 lg:hidden">
          <Link href="/" aria-label="Nomos home">
            <NomosLogo size={22} />
          </Link>
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
          >
            ← back home
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 py-16 md:px-10">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>

        {footer ? (
          <footer className="border-t border-aegis-line px-6 py-5 md:px-10">
            <div className="mx-auto max-w-[420px] text-center">{footer}</div>
          </footer>
        ) : null}
      </main>
    </div>
  );
}
