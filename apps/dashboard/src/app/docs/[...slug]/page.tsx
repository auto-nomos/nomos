import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { DocShell } from '../../../components/docs/doc-shell';
import { docsMdxComponents } from '../../../components/docs/mdx-components';
import { PublicShell } from '../../../components/nomos/public-shell';
import {
  getAllDocs,
  getDocBySlug,
  getNeighbors,
  JOURNEYS,
  LEGACY_SLUG_REDIRECTS,
  readDocSource,
} from '../../../lib/docs';

interface DocsSlugPageProps {
  params: Promise<{ slug: string[] }>;
}

export function generateStaticParams() {
  return getAllDocs().map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: DocsSlugPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) return { title: 'Docs — Nomos' };
  return {
    title: `${doc.title} — Nomos docs`,
    description: doc.description,
  };
}

export default async function DocsSlugPage({ params }: DocsSlugPageProps) {
  const { slug } = await params;

  // Legacy single-segment slug: /docs/quickstart → /docs/get-started/make-your-first-call
  const legacyTarget = slug.length === 1 && slug[0] ? LEGACY_SLUG_REDIRECTS[slug[0]] : undefined;
  if (legacyTarget) {
    redirect(`/docs/${legacyTarget}`);
  }

  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  const source = readDocSource(slug);
  if (source === undefined) notFound();

  const { prev, next } = getNeighbors(slug);
  const docs = getAllDocs();

  return (
    <PublicShell>
      <DocShell doc={doc} docs={docs} journeys={JOURNEYS} prev={prev} next={next} basePath="/docs">
        <MDXRemote
          source={source}
          components={docsMdxComponents}
          options={{ blockJS: false, blockDangerousJS: false }}
        />
      </DocShell>
    </PublicShell>
  );
}
