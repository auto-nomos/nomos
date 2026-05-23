import { ArrowUpRight, Check, Minus } from 'lucide-react';
import Link from 'next/link';
import { COMPARISON_IDS, COMPARISONS } from '../../lib/comparisons';

/**
 * Band 11 — Comparison. One idea: a truth table where Nomos is the only
 * column with every check. Links to dedicated /vs/* pages for the long form.
 */
const FEATURES: { row: string; description?: string }[] = [
  { row: 'Capability tokens (UCAN)' },
  { row: 'Per-call policy decision' },
  { row: 'Cryptographic audit chain' },
  { row: 'MCP-native server' },
  { row: 'Step-up passkey approval' },
  { row: 'Multi-agent UCAN delegation' },
  { row: 'Schema-validated tool calls' },
  { row: 'Self-hostable' },
  { row: 'Open source' },
];

function cellFor(value: boolean | string | undefined): {
  kind: 'yes' | 'no' | 'partial';
  label?: string;
} {
  if (value === true) return { kind: 'yes' };
  if (value === false || value === undefined) return { kind: 'no' };
  return { kind: 'partial', label: String(value) };
}

export function Comparison() {
  const competitors = COMPARISON_IDS.map((id) => COMPARISONS[id]);
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12">
            <div className="eyebrow">the comparison</div>
            <h2 className="display mt-5 max-w-[22ch] text-[56px] leading-[1.02] text-aegis-paper md:text-[64px]">
              Why not just <em>X</em>?
            </h2>
            <p className="mt-6 max-w-[680px] text-base leading-relaxed text-aegis-mute">
              We get asked this every week. Here&rsquo;s the honest answer. Read the full breakdown
              for any cell that surprises you — we link the deep dive under the table.
            </p>
          </div>
          <div className="col-span-12">
            <div className="corners relative overflow-x-auto rounded-sm border border-aegis-line bg-aegis-ink">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-aegis-line font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                    <th className="px-6 py-4 font-normal">feature</th>
                    {competitors.map((c) => (
                      <th key={c.id} className="px-4 py-4 text-center font-normal">
                        {c.name}
                      </th>
                    ))}
                    <th className="border-l border-aegis-line bg-aegis-signal/5 px-4 py-4 text-center font-normal text-aegis-signal">
                      Nomos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map((f, fi) => (
                    <tr
                      key={f.row}
                      className={fi === FEATURES.length - 1 ? '' : 'border-b border-aegis-line/60'}
                    >
                      <th className="px-6 py-4 text-left text-sm font-normal text-aegis-paper">
                        {f.row}
                      </th>
                      {competitors.map((c) => {
                        const cell = cellFor(c.rows[fi]?.competitor);
                        return (
                          <td
                            key={c.id}
                            className="px-4 py-4 text-center font-mono text-[11px] text-aegis-mute"
                          >
                            <Cell {...cell} />
                          </td>
                        );
                      })}
                      <td className="border-l border-aegis-line bg-aegis-signal/5 px-4 py-4 text-center font-mono text-[11px] text-aegis-signal">
                        <Cell {...cellFor(competitors[0]?.rows[fi]?.nomos)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {competitors.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/vs/${c.id}`}
                    className="group flex items-center justify-between gap-3 rounded-sm border border-aegis-line bg-aegis-ink px-5 py-4 transition-colors hover:border-aegis-signal/40 hover:bg-aegis-surface/60"
                  >
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                        nomos vs
                      </div>
                      <div className="mt-1 font-display text-[18px] text-aegis-paper">{c.name}</div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-aegis-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-aegis-signal" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Cell({ kind, label }: { kind: 'yes' | 'no' | 'partial'; label?: string }) {
  if (kind === 'yes') return <Check className="mx-auto h-4 w-4" />;
  if (kind === 'no') return <Minus className="mx-auto h-4 w-4 text-aegis-faint" />;
  return <span className="uppercase tracking-[0.18em] text-aegis-amber">{label}</span>;
}
