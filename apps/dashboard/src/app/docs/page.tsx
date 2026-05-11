'use client';

import { GuideContent } from '../../components/nomos/guide';
import { PublicShell } from '../../components/nomos/public-shell';

/* Public docs: same long-form guide rendered inside the marketing shell.
   Auth-gated /app/guide is the in-product mirror — both use the same
   underlying component so the docs never drift between the two contexts. */

export default function DocsPage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-[1280px] px-6 py-16 md:px-10 md:py-24">
        <GuideContent />
      </div>
    </PublicShell>
  );
}
