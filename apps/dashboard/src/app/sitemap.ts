import type { MetadataRoute } from 'next';
import { getAllDocs } from '../lib/docs';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://auto-nomos.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: {
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  }[] = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/get-started', priority: 0.95, changeFrequency: 'weekly' },
    { path: '/docs', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/integrations', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/pricing', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/security', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/changelog', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/open-source', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/community', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/vs/auth0', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/vs/vault', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/vs/permit-io', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/vs/raw-oauth', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/sign-up', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/sign-in', priority: 0.3, changeFrequency: 'yearly' },
  ];
  for (const doc of getAllDocs()) {
    routes.push({
      path: `/docs/${doc.slug.join('/')}`,
      priority: 0.7,
      changeFrequency: 'weekly',
    });
  }
  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
