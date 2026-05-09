import { ApproveClient } from './approve-client';

export const dynamic = 'force-dynamic';

export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-md p-6">
      <ApproveClient approvalId={id} />
    </main>
  );
}
