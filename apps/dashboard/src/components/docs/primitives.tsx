'use client';

import { Check, Copy } from 'lucide-react';
import Image from 'next/image';
import { Children, isValidElement, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-[1.75] text-aegis-paper/90">{children}</p>;
}

export function K({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[3px] border border-aegis-line bg-aegis-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-aegis-paper">
      {children}
    </code>
  );
}

interface CodeProps {
  children: string;
  lang?: string;
  file?: string;
}

export function Code({ children, lang, file }: CodeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op: clipboard denied */
    }
  };

  return (
    <figure className="overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface-2">
      <figcaption className="flex items-center justify-between border-b border-aegis-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
        <span>{file ?? lang ?? 'shell'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-aegis-mute transition-colors hover:text-aegis-paper"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              copy
            </>
          )}
        </button>
      </figcaption>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-[1.6] text-aegis-paper">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'signal';
  title?: string;
  children: React.ReactNode;
}) {
  const tones = {
    info: 'border-aegis-iris/40 bg-aegis-iris/5 text-aegis-paper',
    warn: 'border-aegis-amber/40 bg-aegis-amber/5 text-aegis-paper',
    signal: 'border-aegis-signal/40 bg-aegis-signal/5 text-aegis-paper',
  } as const;
  return (
    <div className={cn('rounded-sm border-l-2 px-4 py-3 text-[14px] leading-relaxed', tones[tone])}>
      {title ? <p className="mb-1 font-medium text-aegis-paper">{title}</p> : null}
      {children}
    </div>
  );
}

export function Step({
  n,
  title,
  children,
}: {
  n: string | number;
  title: string;
  children: React.ReactNode;
}) {
  const label = typeof n === 'number' ? String(n).padStart(2, '0') : n;
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] gap-4 border-l border-aegis-line pl-4">
      <span className="font-display text-2xl leading-none text-aegis-signal">{label}</span>
      <div>
        <div className="font-medium text-aegis-paper">{title}</div>
        <div className="mt-1 space-y-3 text-[14px] leading-[1.7] text-aegis-mute">{children}</div>
      </div>
    </li>
  );
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="ml-0 list-none space-y-4">{children}</ol>;
}

export function Shot({
  src,
  alt,
  caption,
  width = 1440,
  height = 900,
}: {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}) {
  const normalized = src.startsWith('/') ? src : `/docs/screenshots/${src}`;
  return (
    <figure className="my-3 overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface-2">
      <Image
        src={normalized}
        alt={alt}
        width={width}
        height={height}
        className="h-auto w-full"
        sizes="(max-width: 768px) 100vw, 720px"
      />
      {caption ? (
        <figcaption className="border-t border-aegis-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function Faqs({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <ul className="space-y-3">
      {items.map(([q, a]) => (
        <li
          key={q}
          className="overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface"
        >
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 font-medium text-aegis-paper transition-colors hover:bg-aegis-surface-2">
              {q}
              <span className="font-mono text-xl text-aegis-signal transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="border-t border-aegis-line bg-aegis-surface-2 px-5 py-4 text-[14px] leading-relaxed text-aegis-mute">
              {a}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

interface PrereqProps {
  items: string[];
}

export function Prereqs({ items }: PrereqProps) {
  return (
    <div className="rounded-sm border border-aegis-line bg-aegis-surface-2/40 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
        Before you start
      </p>
      <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-aegis-paper/90">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-1 inline-block h-1 w-1 rounded-full bg-aegis-signal" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Verify({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-aegis-signal/30 bg-aegis-signal/5 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-signal">
        Verify it worked
      </p>
      <div className="mt-3 space-y-3 text-[14px] leading-[1.7] text-aegis-paper/90">{children}</div>
    </div>
  );
}

type PathId = 'cli' | 'mcp' | 'sdk';

const PATH_ORDER: { id: PathId; label: string }[] = [
  { id: 'cli', label: 'CLI' },
  { id: 'mcp', label: 'MCP' },
  { id: 'sdk', label: 'SDK' },
];

const PATH_STORAGE_KEY = 'nomos.get-started.path';

export function Pane({ id, children }: { id: PathId; children: React.ReactNode }) {
  // Marker component — rendering handled by PathTabs.
  return <div data-pane={id}>{children}</div>;
}

export function PathTabs({
  defaultPath = 'sdk',
  children,
}: {
  defaultPath?: PathId;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<PathId>(defaultPath);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PATH_STORAGE_KEY);
      if (stored === 'cli' || stored === 'mcp' || stored === 'sdk') {
        setActive(stored);
      }
    } catch {
      /* localStorage denied */
    }
  }, []);

  const panes = new Map<PathId, React.ReactNode>();
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { id?: PathId; children?: React.ReactNode };
    if (props.id && (props.id === 'cli' || props.id === 'mcp' || props.id === 'sdk')) {
      panes.set(props.id, props.children);
    }
  });

  const select = (id: PathId) => {
    setActive(id);
    try {
      window.localStorage.setItem(PATH_STORAGE_KEY, id);
    } catch {
      /* localStorage denied */
    }
  };

  return (
    <div className="overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface-2">
      <div className="flex items-center border-b border-aegis-line bg-aegis-ink/40">
        {PATH_ORDER.map((p) => {
          const has = panes.has(p.id);
          const isActive = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => has && select(p.id)}
              disabled={!has}
              className={cn(
                'border-r border-aegis-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors',
                isActive
                  ? 'bg-aegis-surface-2 text-aegis-signal'
                  : 'text-aegis-faint hover:text-aegis-mute',
                !has && 'cursor-not-allowed opacity-30',
              )}
            >
              {p.label}
            </button>
          );
        })}
        <span className="ml-auto px-4 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
          path
        </span>
      </div>
      <div className="p-4">{panes.get(active) ?? null}</div>
    </div>
  );
}

export function NextSteps({
  items,
}: {
  items: { href: string; label: string; description?: string }[];
}) {
  return (
    <div className="grid gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line md:grid-cols-2">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="group flex flex-col gap-1 bg-aegis-ink p-5 transition-colors hover:bg-aegis-surface-2"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            Next →
          </span>
          <span className="font-display text-[18px] text-aegis-paper">{item.label}</span>
          {item.description ? (
            <span className="text-[13px] leading-relaxed text-aegis-mute">{item.description}</span>
          ) : null}
        </a>
      ))}
    </div>
  );
}
