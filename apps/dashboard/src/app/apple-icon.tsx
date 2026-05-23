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
        <rect
          x="3"
          y="3"
          width="26"
          height="26"
          rx="2"
          fill="none"
          stroke="#3a4150"
          strokeWidth="1.2"
        />
        <line
          x1="9"
          y1="8"
          x2="9"
          y2="24"
          stroke="#e8dcc4"
          strokeWidth="2.4"
          strokeLinecap="square"
        />
        <line
          x1="23"
          y1="8"
          x2="23"
          y2="24"
          stroke="#e8dcc4"
          strokeWidth="2.4"
          strokeLinecap="square"
        />
        <line
          x1="9.7"
          y1="8.7"
          x2="22.3"
          y2="23.3"
          stroke="#bfff00"
          strokeWidth="2.4"
          strokeLinecap="square"
        />
        <circle cx="23" cy="24" r="1.6" fill="#bfff00" />
      </svg>
    </div>,
    size,
  );
}
