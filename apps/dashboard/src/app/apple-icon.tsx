import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f1419',
        borderRadius: 32,
      }}
    >
      <svg width="140" height="140" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <title>Nomos</title>
        <path
          d="M4 8 L16 14 L28 8"
          fill="none"
          stroke="#bfff00"
          strokeWidth="3"
          strokeLinecap="square"
          strokeLinejoin="miter"
          opacity="0.5"
        />
        <path
          d="M4 17 L16 23 L28 17"
          fill="none"
          stroke="#bfff00"
          strokeWidth="3.4"
          strokeLinecap="square"
          strokeLinejoin="miter"
          opacity="0.78"
        />
        <path
          d="M4 26 L16 30 L28 26"
          fill="none"
          stroke="#bfff00"
          strokeWidth="3.8"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </div>,
    size,
  );
}
