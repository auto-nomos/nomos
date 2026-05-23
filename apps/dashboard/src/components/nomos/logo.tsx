/**
 * Nomos wordmark — Greek nu monogram (Ν) in a hairline frame.
 * "Nomos" is the Greek word for law/order, so the mark roots the brand
 * etymologically without needing a glossary. Two paper-toned legs, one
 * chartreuse diagonal, a small seal dot at the diagonal terminus.
 * Reads cleanly from a 16px favicon up to a 128px hero.
 */
export function NomosLogo({
  size = 28,
  showWordmark = true,
  className,
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`} aria-label="Nomos">
      <Mark size={size} />
      {showWordmark ? (
        <span
          className="font-display text-aegis-paper"
          style={{
            fontSize: size * 0.8,
            fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 0",
            letterSpacing: '-0.025em',
            lineHeight: 1,
          }}
        >
          Nomos
        </span>
      ) : null}
    </span>
  );
}

function Mark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <title>Nomos mark</title>
      {/* Hairline frame — the "seal" container. */}
      <rect
        x="3"
        y="3"
        width="26"
        height="26"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-aegis-line-strong"
      />
      {/* Inner sigil — the Greek nu (Ν): two upright legs in paper,
          one diagonal in chartreuse, anchored by a small seal dot. */}
      <line
        x1="9"
        y1="8"
        x2="9"
        y2="24"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
        className="text-aegis-paper"
      />
      <line
        x1="23"
        y1="8"
        x2="23"
        y2="24"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
        className="text-aegis-paper"
      />
      <line
        x1="9.7"
        y1="8.7"
        x2="22.3"
        y2="23.3"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
        className="text-aegis-signal"
      />
      <circle cx="23" cy="24" r="1.6" fill="currentColor" className="text-aegis-signal" />
    </svg>
  );
}
