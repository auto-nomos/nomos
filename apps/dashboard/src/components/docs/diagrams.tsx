export function DiagramFlow() {
  return (
    <figure className="my-3 overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface-2 p-6">
      <svg
        viewBox="0 0 720 220"
        className="w-full"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Nomos request flow"
      >
        <title>Nomos request flow</title>
        <defs>
          <marker
            id="arr-flow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--aegis-signal))" />
          </marker>
        </defs>

        {[
          { x: 30, label: 'Agent', sub: 'SDK' },
          { x: 200, label: 'Control plane', sub: 'mints UCAN' },
          { x: 380, label: 'PDP', sub: 'cedar gate' },
          { x: 560, label: 'SaaS API', sub: 'upstream' },
        ].map((node) => (
          <g key={node.label}>
            <rect
              x={node.x}
              y="60"
              width="140"
              height="80"
              fill="hsl(var(--aegis-ink))"
              stroke="hsl(var(--aegis-line-strong))"
            />
            <text
              x={node.x + 70}
              y="98"
              textAnchor="middle"
              fontFamily="var(--font-display)"
              fontSize="18"
              fill="hsl(var(--aegis-paper))"
            >
              {node.label}
            </text>
            <text
              x={node.x + 70}
              y="118"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="10"
              letterSpacing="2"
              fill="hsl(var(--aegis-mute))"
            >
              {node.sub.toUpperCase()}
            </text>
          </g>
        ))}

        {[
          [170, 200, 'intent'],
          [340, 380, 'mint'],
          [520, 560, 'proxy'],
        ].map(([a, b, label]) => (
          <g key={label as string}>
            <line
              x1={a as number}
              y1="100"
              x2={b as number}
              y2="100"
              stroke="hsl(var(--aegis-signal))"
              strokeWidth="1.5"
              markerEnd="url(#arr-flow)"
            />
            <text
              x={((a as number) + (b as number)) / 2}
              y="92"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="10"
              letterSpacing="2"
              fill="hsl(var(--aegis-signal))"
            >
              {(label as string).toUpperCase()}
            </text>
          </g>
        ))}

        <text
          x="360"
          y="195"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="10"
          letterSpacing="2"
          fill="hsl(var(--aegis-faint))"
        >
          AUDIT CHAIN ← EVERY DECISION LANDS HERE
        </text>
        <line
          x1="100"
          y1="170"
          x2="630"
          y2="170"
          stroke="hsl(var(--aegis-iris))"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      </svg>
    </figure>
  );
}

export function DiagramStepUp() {
  return (
    <figure className="my-3 overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface-2 p-6">
      <svg
        viewBox="0 0 720 200"
        className="w-full"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Step-up sequence"
      >
        <title>Step-up sequence</title>
        {[
          { x: 30, label: '1 deny', tone: 'coral' },
          { x: 180, label: '2 push', tone: 'amber' },
          { x: 330, label: '3 passkey', tone: 'iris' },
          { x: 480, label: '4 cosigner', tone: 'signal' },
          { x: 600, label: '5 retry → allow', tone: 'signal' },
        ].map((step) => (
          <g key={step.label}>
            <rect
              x={step.x}
              y="50"
              width="120"
              height="100"
              fill="hsl(var(--aegis-ink))"
              stroke={`hsl(var(--aegis-${step.tone}))`}
              strokeWidth="1.4"
            />
            <text
              x={step.x + 60}
              y="105"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="11"
              letterSpacing="2"
              fill={`hsl(var(--aegis-${step.tone}))`}
            >
              {step.label.toUpperCase()}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export function Diagram({ name }: { name: 'flow' | 'step-up' }) {
  if (name === 'flow') return <DiagramFlow />;
  if (name === 'step-up') return <DiagramStepUp />;
  return null;
}
