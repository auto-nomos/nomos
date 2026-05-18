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
    </div>,
    size,
  );
}
