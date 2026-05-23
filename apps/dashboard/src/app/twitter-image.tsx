import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Nomos — open source authorization for AI agents';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function TwitterImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: 'linear-gradient(135deg, #0f1419 0%, #161b21 60%, #0f1419 100%)',
        color: '#e8dcc4',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <svg width="56" height="56" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <title>Nomos</title>
          <path
            d="M16 3 L28 8 L28 17 L26 18 L28 19 L28 20.5 L16 29 L4 20.5 L4 8 Z"
            fill="none"
            stroke="#e8dcc4"
            strokeWidth="1.4"
            strokeLinejoin="miter"
          />
          <path
            d="M9.5 22 L16 8 L22.5 22 M11.5 18.5 L20.5 18.5"
            fill="none"
            stroke="#bfff00"
            strokeWidth="1.8"
            strokeLinecap="square"
          />
        </svg>
        <span
          style={{
            fontSize: 38,
            letterSpacing: '-0.02em',
            color: '#e8dcc4',
          }}
        >
          NOMOS
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            fontSize: 76,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            color: '#e8dcc4',
            maxWidth: 1040,
          }}
        >
          <span>Your agent should never hold a&nbsp;</span>
          <span style={{ color: '#bfff00' }}>key it could leak.</span>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            lineHeight: 1.4,
            color: '#9ca3af',
            maxWidth: 980,
          }}
        >
          <span>
            Open source authorization for AI agents. Capability tokens, Cedar policy, cryptographic
            audit, MCP-native.
          </span>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 18,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#6b7280',
          fontFamily: 'monospace',
        }}
      >
        <span>auto-nomos.com</span>
        <span>open source · MCP-native</span>
      </div>
    </div>,
    size,
  );
}
