import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f1419',
        borderRadius: 4,
      }}
    >
      <svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <title>Nomos</title>
        <path
          d="M5 9 L16 13 L27 9"
          fill="none"
          stroke="#7c8a99"
          strokeWidth="2.2"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <path
          d="M5 17 L16 21 L27 17"
          fill="none"
          stroke="#e8dcc4"
          strokeWidth="2.6"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <path
          d="M4 25 L16 29.5 L28 25"
          fill="none"
          stroke="#bfff00"
          strokeWidth="3"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </div>,
    size,
  );
}
