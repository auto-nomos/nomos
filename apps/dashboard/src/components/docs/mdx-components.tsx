import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Diagram, DiagramFlow, DiagramStepUp } from './diagrams';
import {
  Callout,
  Code,
  Faqs,
  K,
  NextSteps,
  P,
  Pane,
  PathTabs,
  Prereqs,
  Shot,
  Step,
  Steps,
  Verify,
} from './primitives';

type WithChildren<T = unknown> = T & { children?: ReactNode };

export const docsMdxComponents = {
  h1: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'h1'>>) => (
    <h1 className="display mt-0 text-[42px] leading-tight text-aegis-paper" {...rest}>
      {children}
    </h1>
  ),
  h2: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'h2'>>) => (
    <h2
      className="mt-12 scroll-mt-32 font-display text-[28px] leading-tight text-aegis-paper"
      {...rest}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'h3'>>) => (
    <h3 className="mt-8 font-display text-[20px] text-aegis-paper" {...rest}>
      {children}
    </h3>
  ),
  p: ({ children }: WithChildren<ComponentPropsWithoutRef<'p'>>) => <P>{children}</P>,
  ul: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'ul'>>) => (
    <ul className="ml-6 list-disc space-y-1.5 marker:text-aegis-signal" {...rest}>
      {children}
    </ul>
  ),
  ol: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'ol'>>) => (
    <ol className="ml-6 list-decimal space-y-2 marker:text-aegis-signal" {...rest}>
      {children}
    </ol>
  ),
  li: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'li'>>) => (
    <li className="text-[15px] leading-[1.7] text-aegis-paper/90" {...rest}>
      {children}
    </li>
  ),
  blockquote: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'blockquote'>>) => (
    <blockquote
      className="border-l-2 border-aegis-iris/40 bg-aegis-iris/5 px-4 py-3 text-[14px] text-aegis-paper"
      {...rest}
    >
      {children}
    </blockquote>
  ),
  table: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'table'>>) => (
    <div className="overflow-hidden rounded-sm border border-aegis-line">
      <table className="w-full border-collapse text-[13px]" {...rest}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'thead'>>) => (
    <thead
      className="bg-aegis-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint"
      {...rest}
    >
      {children}
    </thead>
  ),
  th: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'th'>>) => (
    <th className="px-4 py-2.5" {...rest}>
      {children}
    </th>
  ),
  tr: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'tr'>>) => (
    <tr className="border-b border-aegis-line/60 last:border-0" {...rest}>
      {children}
    </tr>
  ),
  td: ({ children, ...rest }: WithChildren<ComponentPropsWithoutRef<'td'>>) => (
    <td className="px-4 py-3 text-aegis-mute" {...rest}>
      {children}
    </td>
  ),
  a: ({ href, children }: WithChildren<ComponentPropsWithoutRef<'a'>>) => {
    if (typeof href === 'string' && (href.startsWith('http') || href.startsWith('mailto:'))) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-aegis-signal underline-offset-2 hover:underline"
        >
          {children}
        </a>
      );
    }
    return (
      <Link
        href={(href as string) ?? '#'}
        className="text-aegis-signal underline-offset-2 hover:underline"
      >
        {children}
      </Link>
    );
  },
  code: ({ children }: WithChildren<ComponentPropsWithoutRef<'code'>>) => (
    <K>{children as ReactNode}</K>
  ),
  pre: ({ children }: WithChildren<ComponentPropsWithoutRef<'pre'>>) => {
    const child = (children as { props?: { className?: string; children?: string } })?.props;
    const className = child?.className ?? '';
    const lang = className.replace('language-', '') || undefined;
    const src = (child?.children as string) ?? '';
    return <Code lang={lang}>{src}</Code>;
  },
  Callout,
  Code,
  K,
  Step,
  Steps,
  Shot,
  Faqs,
  Prereqs,
  Verify,
  NextSteps,
  Pane,
  PathTabs,
  Diagram,
  DiagramFlow,
  DiagramStepUp,
  Link,
};
