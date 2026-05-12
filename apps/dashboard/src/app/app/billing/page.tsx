'use client';

import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { trpc } from '../../../lib/trpc';

export default function BillingPage() {
  const usage = trpc.billing.usage.useQuery(undefined, { refetchInterval: 30_000 });

  if (usage.isPending) {
    return <p className="text-sm text-muted-foreground">Loading usage…</p>;
  }
  if (!usage.data) {
    return <p className="text-sm text-destructive">Failed to load usage.</p>;
  }
  const { plan, mintCount, proxyCount, total, cap, percentUsed, daysToReset } = usage.data;
  const overLimit = total >= cap;
  const warning = percentUsed >= 80;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Usage resets on the 1st of each month (UTC). Counts cover mint-ucan + proxy calls.
          </p>
        </div>
        <Badge
          variant={plan === 'free' ? 'outline' : 'success'}
          className="uppercase tracking-wide"
          data-testid="plan-badge"
        >
          {plan} plan
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">This month</CardTitle>
          <CardDescription>
            {total.toLocaleString()} / {cap.toLocaleString()} calls used · {daysToReset} day
            {daysToReset === 1 ? '' : 's'} until reset
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsageMeter percent={percentUsed} overLimit={overLimit} warning={warning} />
          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border bg-muted/30 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">UCAN mints</dt>
              <dd className="mt-1 font-mono text-base">{mintCount.toLocaleString()}</dd>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Proxy calls</dt>
              <dd className="mt-1 font-mono text-base">{proxyCount.toLocaleString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {plan === 'free' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upgrade to Pro</CardTitle>
            <CardDescription>
              Lifts the cap to 100 000 calls per month and unlocks the Pro support channel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-2">
              <FeatureLine>100k UCAN mints + 100k proxy calls per month</FeatureLine>
              <FeatureLine>Pro-tier audit retention (90 days hot, 7 years cold)</FeatureLine>
              <FeatureLine>Email-first support; 1-business-day response SLA</FeatureLine>
            </ul>
            <UpgradeCta
              checkoutUrl={usage.data.stripeCheckoutUrl}
              priceId={usage.data.upgradeStripePriceId}
            />
          </CardContent>
        </Card>
      )}

      {plan !== 'free' && (
        <p className="text-xs text-muted-foreground">
          Manage your subscription via the Stripe customer portal. Need limit overrides? Email
          billing@auto-nomos.com.
        </p>
      )}
    </div>
  );
}

function UsageMeter({
  percent,
  overLimit,
  warning,
}: {
  percent: number;
  overLimit: boolean;
  warning: boolean;
}) {
  const tone = overLimit ? 'bg-destructive' : warning ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full transition-all ${tone}`}
        style={{ width: `${Math.min(100, percent)}%` }}
        data-testid="usage-bar"
      />
    </div>
  );
}

function FeatureLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      <span>{children}</span>
    </li>
  );
}

function UpgradeCta({
  checkoutUrl,
  priceId,
}: {
  checkoutUrl: string | null;
  priceId: string | null;
}) {
  if (checkoutUrl) {
    return (
      <Button asChild>
        <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
          Upgrade via Stripe
          <ArrowRight className="ml-1 h-4 w-4" />
        </a>
      </Button>
    );
  }
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
      Stripe is not configured for this environment. Set <code>STRIPE_CHECKOUT_URL_PRO</code>
      {priceId ? ` (price ${priceId}) ` : ' '}
      on the control plane to enable upgrades.
    </div>
  );
}
