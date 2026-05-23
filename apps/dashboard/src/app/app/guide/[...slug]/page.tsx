import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { DocShell } from '../../../../components/docs/doc-shell';
import { docsMdxComponents } from '../../../../components/docs/mdx-components';
import {
  getAllDocs,
  getDocBySlug,
  getNeighbors,
  JOURNEYS,
  LEGACY_SLUG_REDIRECTS,
  readDocSource,
} from '../../../../lib/docs';

interface GuideSlugPageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: GuideSlugPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) return { title: 'Guide — Nomos' };
  return {
    title: `${doc.title} — Nomos guide`,
    description: doc.description,
  };
}

export default async function GuideSlugPage({ params }: GuideSlugPageProps) {
  const { slug } = await params;

  // Legacy /app/guide/quickstart → /app/guide/get-started/make-your-first-call
  const legacyTarget = slug.length === 1 && slug[0] ? LEGACY_SLUG_REDIRECTS[slug[0]] : undefined;
  if (legacyTarget) {
    redirect(`/app/guide/${legacyTarget}`);
  }

  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  const source = readDocSource(slug);
  if (source === undefined) notFound();

  const { prev, next } = getNeighbors(slug);
  const docs = getAllDocs();

  return (
    <DocShell
      doc={doc}
      docs={docs}
      journeys={JOURNEYS}
      prev={prev}
      next={next}
      basePath="/app/guide"
    >
      <MDXRemote source={source} components={docsMdxComponents} />
    </DocShell>
  );
}
