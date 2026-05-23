/**
 * Nomos wordmark — three stacked chevrons + NOMOS in display caps.
 * Each chevron is a UCAN in the delegation chain: the parent grants,
 * the child attenuates, the leaf fires. The bottom chevron — the call
 * that actually executes — is chartreuse. Geometric, scales from 16px
 * favicon to a hero block, no internal text or alpha glyph required.
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
            fontSize: size * 0.78,
            fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 0",
            letterSpacing: '-0.015em',
            lineHeight: 1,
          }}
        >
          NOMOS
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
      {/* Three downward chevrons — root → branch → leaf. Each one widens and
          thickens as the chain attenuates toward the actual call. */}
      <path
        d="M5 9 L16 13 L27 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="text-aegis-mute"
      />
      <path
        d="M5 17 L16 21 L27 17"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="text-aegis-paper"
      />
      <path
        d="M4 25 L16 29.5 L28 25"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="text-aegis-signal"
      />
    </svg>
  );
}
