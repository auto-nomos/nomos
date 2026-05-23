import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export interface DocFrontmatter {
  title: string;
  description?: string;
  journey: 'get-started' | 'connect' | 'providers' | 'policies' | 'operate';
  order: number;
  /** in-app product page to jump to from the right rail */
  product?: { href: string; label: string }[];
  /** alternate slugs we want to keep working (legacy URLs) */
  redirectsFrom?: string[];
  /** estimated read time in minutes */
  readMinutes?: number;
  /** show "beta" / "GA" / "alpha" badge in nav */
  badge?: 'alpha' | 'beta' | 'GA';
}

export interface DocMeta extends DocFrontmatter {
  slug: string[];
  filePath: string;
}

export interface JourneyMeta {
  id: DocFrontmatter['journey'];
  label: string;
  description: string;
}

export const JOURNEYS: JourneyMeta[] = [
  {
    id: 'get-started',
    label: 'Get started',
    description: 'Sign up, connect a provider, ship your first call.',
  },
  {
    id: 'connect',
    label: 'Connect agents',
    description: 'Wire Cursor, Claude Desktop, Codex, raw MCP, or the SDKs.',
  },
  {
    id: 'providers',
    label: 'Connect providers',
    description: 'OAuth + non-OAuth providers, one tutorial each.',
  },
  {
    id: 'policies',
    label: 'Author policies',
    description: 'Templates, the visual builder, Cedar, step-up, swarms.',
  },
  {
    id: 'operate',
    label: 'Operate',
    description: 'API keys, audit chain, RBAC, invites, self-host.',
  },
];

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'docs');

let cachedDocs: DocMeta[] | null = null;

function readAllMdxFiles(): DocMeta[] {
  if (cachedDocs) return cachedDocs;
  if (!fs.existsSync(CONTENT_ROOT)) {
    cachedDocs = [];
    return cachedDocs;
  }
  const docs: DocMeta[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.mdx')) continue;
      const raw = fs.readFileSync(full, 'utf-8');
      const { data } = matter(raw);
      const relative = path.relative(CONTENT_ROOT, full).replace(/\.mdx$/, '');
      const slug = relative.split(path.sep);
      docs.push({
        slug,
        filePath: full,
        ...(data as DocFrontmatter),
      });
    }
  };
  walk(CONTENT_ROOT);
  docs.sort((a, b) => {
    if (a.journey !== b.journey) {
      const ai = JOURNEYS.findIndex((j) => j.id === a.journey);
      const bi = JOURNEYS.findIndex((j) => j.id === b.journey);
      return ai - bi;
    }
    return (a.order ?? 0) - (b.order ?? 0);
  });
  cachedDocs = docs;
  return docs;
}

export function getAllDocs(): DocMeta[] {
  return readAllMdxFiles();
}

export function getDocBySlug(slug: string[]): DocMeta | undefined {
  const joined = slug.join('/');
  return readAllMdxFiles().find((d) => d.slug.join('/') === joined);
}

export function getDocByLegacySlug(legacySlug: string): DocMeta | undefined {
  return readAllMdxFiles().find((d) => d.redirectsFrom?.includes(legacySlug));
}

export function readDocSource(slug: string[]): string | undefined {
  const doc = getDocBySlug(slug);
  if (!doc) return undefined;
  const raw = fs.readFileSync(doc.filePath, 'utf-8');
  const { content } = matter(raw);
  return content;
}

export function getDocsByJourney(journey: DocFrontmatter['journey']): DocMeta[] {
  return readAllMdxFiles().filter((d) => d.journey === journey);
}

export function getNeighbors(slug: string[]): {
  prev: DocMeta | undefined;
  next: DocMeta | undefined;
} {
  const docs = readAllMdxFiles();
  const idx = docs.findIndex((d) => d.slug.join('/') === slug.join('/'));
  return {
    prev: idx > 0 ? docs[idx - 1] : undefined,
    next: idx >= 0 && idx < docs.length - 1 ? docs[idx + 1] : undefined,
  };
}

/**
 * Legacy slug map. Single-segment topics from the original 19-section guide
 * route to their new journey path. Used by /app/guide/[topic] + /docs#anchor.
 */
export const LEGACY_SLUG_REDIRECTS: Record<string, string> = {
  'what-is-nomos': 'get-started/what-is-nomos',
  'mental-model': 'get-started/mental-model',
  quickstart: 'get-started/quickstart',
  connections: 'providers/overview',
  apps: 'operate/api-keys',
  policies: 'policies/templates',
  'filesystem-ssh': 'providers/filesystem',
  'dynamic-intent': 'policies/dynamic-intent',
  'step-up': 'policies/step-up-approvals',
  'standing-grants': 'policies/standing-grants',
  audit: 'operate/audit-chain',
  swarms: 'policies/swarm-delegation',
  cloud: 'providers/cloud-azure',
  sdk: 'connect/sdk-typescript',
  telegram: 'connect/telegram-approvals',
  organizations: 'operate/organizations',
  members: 'operate/members-and-roles',
  invites: 'operate/invite-teammates',
  faq: 'operate/faq',
};
