import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nomos',
    short_name: 'Nomos',
    description:
      'Control plane for AI agents — federated cloud keys, multi-agent swarms, live audit.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1419',
    theme_color: '#0f1419',
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    categories: ['security', 'developer-tools', 'productivity'],
  };
}
