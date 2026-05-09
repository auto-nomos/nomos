'use client';

import { Activity, Bot, KeyRound, Shield } from 'lucide-react';
import Link from 'next/link';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { trpc } from '../../lib/trpc';

export default function AppHomePage() {
  const customer = trpc.customers.get.useQuery();
  const agents = trpc.agents.list.useQuery();
  const policies = trpc.policies.list.useQuery();
  const audit = trpc.audit.list.useQuery({ limit: 5 });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {customer.data?.name ?? 'Workspace'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Capabilities, not credentials. Mint UCANs and let the PDP enforce policy.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<Bot className="h-4 w-4" />}
          label="Agents"
          value={agents.data?.length ?? '—'}
          href="/app/agents"
        />
        <Stat
          icon={<Shield className="h-4 w-4" />}
          label="Policies"
          value={policies.data?.length ?? '—'}
          href="/app/policies"
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label="Recent decisions"
          value={audit.data?.length ?? '—'}
          href="/app/audit"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> Get started
          </CardTitle>
          <CardDescription>
            Walk through onboarding to connect a SaaS, create your first agent and policy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/onboarding">Open onboarding wizard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="transition-colors hover:border-foreground/40">
        <CardHeader className="space-y-0 pb-2">
          <CardDescription className="flex items-center gap-2">
            {icon}
            {label}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tabular-nums">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
