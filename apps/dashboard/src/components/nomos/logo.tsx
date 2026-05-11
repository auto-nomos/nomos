/**
 * Nomos wordmark — the Α (alpha) is replaced by an inverted shield motif
 * borrowed from the Athenian aegis. Single SVG so it scales without
 * raster artifacts and can sit anywhere in the layout. The shield is
 * intentionally asymmetric — a tiny notch on the right edge prevents
 * the mark from feeling generic.
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
            letterSpacing: '-0.02em',
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
      {/* Outer hex shield — sharp top, faceted shoulders, notched right edge.
          Notch is the differentiator: at small sizes you still read it as
          a shield, but the asymmetry hints at the cryptographic seal idea. */}
      <path
        d="M16 1.5 L29 7 L29 17.2 L26.8 18.4 L29 19.6 L29 21 L16 30.5 L3 21 L3 7 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="miter"
        className="text-aegis-paper"
      />
      {/* Inner alpha — three diagonals forming Α. Top stroke meets center
          where the chartreuse signal lights it. */}
      <path
        d="M9.5 22 L16 8 L22.5 22 M11.5 18.5 L20.5 18.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
        className="text-aegis-signal"
      />
    </svg>
  );
}
