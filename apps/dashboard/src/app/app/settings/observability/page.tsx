'use client';

import { AlertTriangle, MessageSquareText, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { trpc } from '../../../../lib/trpc';
import { usePermissions } from '../../../../lib/use-permissions';

const CURRENT_TOS_VERSION = '2026-05-25';

export default function ObservabilitySettingsPage() {
  const { can } = usePermissions();
  const canEdit = can('org', 'update');
  const cfg = trpc.observability.observabilityConfig.useQuery({});
  const utils = trpc.useUtils();
  const update = trpc.observability.observabilityConfigUpdate.useMutation({
    onSuccess: () => {
      void utils.observability.observabilityConfig.invalidate();
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [sampleRate, setSampleRate] = useState(100);
  const [retentionDays, setRetentionDays] = useState(30);
  const [kmsArn, setKmsArn] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [showTos, setShowTos] = useState(false);

  useEffect(() => {
    if (!cfg.data) return;
    setEnabled(cfg.data.promptCaptureEnabled);
    setSampleRate(cfg.data.promptCaptureSampleRate);
    setRetentionDays(cfg.data.promptRetentionDays);
    setKmsArn(cfg.data.promptKmsKeyArn ?? '');
    setTosAccepted(cfg.data.acceptedTosVersion === CURRENT_TOS_VERSION);
  }, [cfg.data]);

  const dirty =
    !!cfg.data &&
    (enabled !== cfg.data.promptCaptureEnabled ||
      sampleRate !== cfg.data.promptCaptureSampleRate ||
      retentionDays !== cfg.data.promptRetentionDays ||
      (kmsArn || null) !== cfg.data.promptKmsKeyArn ||
      tosAccepted !== (cfg.data.acceptedTosVersion === CURRENT_TOS_VERSION));

  function onSave() {
    update.mutate({
      promptCaptureEnabled: enabled,
      promptCaptureSampleRate: sampleRate,
      promptRetentionDays: retentionDays,
      promptKmsKeyArn: kmsArn.trim().length > 0 ? kmsArn.trim() : null,
      acceptedTosVersion: tosAccepted ? CURRENT_TOS_VERSION : null,
    });
  }

  if (cfg.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading observability config…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="eyebrow mb-2">settings · observability</div>
        <h1 className="text-2xl font-semibold">Prompt + reasoning capture</h1>
        <p className="mt-1 text-sm text-aegis-mute">
          Opt-in capture of LLM prompts and chain-of-thought traces alongside each agent span.
          Redacted by default (PII scrubbed); encrypted at rest with your platform key. Capture
          stays OFF until you toggle it and accept the data-handling addendum.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="h-4 w-4" /> Capture
          </CardTitle>
          <CardDescription>
            Enable to start storing prompts on a sample of agent spans. Disabling is immediate —
            already-captured rows stay until retention expires.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!canEdit}
            />
            <span>Capture prompts + reasoning traces</span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="sample-rate">Sample rate</Label>
            <div className="flex items-center gap-3">
              <input
                id="sample-rate"
                type="range"
                min={0}
                max={100}
                step={1}
                value={sampleRate}
                onChange={(e) => setSampleRate(Number(e.target.value))}
                disabled={!canEdit || !enabled}
                className="flex-1"
              />
              <code className="w-12 text-right font-mono text-sm">{sampleRate}%</code>
            </div>
            <p className="text-xs text-aegis-mute">
              Stable-hashed by span id so prompt + reasoning sample together for the same span.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="retention">Retention (days)</Label>
              <Input
                id="retention"
                type="number"
                min={1}
                max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kms-arn">Customer KMS key ARN (optional)</Label>
              <Input
                id="kms-arn"
                value={kmsArn}
                onChange={(e) => setKmsArn(e.target.value)}
                disabled={!canEdit}
                placeholder="arn:aws:kms:…  (uses platform key when blank)"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Data-handling addendum (v{CURRENT_TOS_VERSION})
          </CardTitle>
          <CardDescription>
            Capture stays OFF until an admin in your organisation accepts the current addendum, even
            if the toggle is on. Acceptance is per-customer and recorded with version.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tosAccepted ? (
            <p className="text-sm">
              Accepted version <code className="font-mono">{CURRENT_TOS_VERSION}</code>.
            </p>
          ) : (
            <p className="text-sm text-aegis-amber">
              Not accepted. Capture will stay off regardless of the toggle above.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowTos(true)}
              disabled={!canEdit}
            >
              Read addendum
            </Button>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={tosAccepted}
                onChange={(e) => setTosAccepted(e.target.checked)}
                disabled={!canEdit}
              />
              <span>I accept the data-handling addendum (v{CURRENT_TOS_VERSION}).</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {enabled && !tosAccepted ? (
        <div className="flex items-start gap-2 rounded-md border border-aegis-amber/40 bg-aegis-amber/5 p-3 text-sm text-aegis-amber">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          <p>
            You've toggled capture on but the addendum is not accepted. The control-plane will drop
            every prompt at ingest until acceptance is recorded.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <p className="mr-auto text-xs text-aegis-mute">
          {update.isPending
            ? 'Saving…'
            : update.isSuccess
              ? 'Saved.'
              : update.error
                ? `Error: ${update.error.message}`
                : ''}
        </p>
        <Button onClick={onSave} disabled={!canEdit || !dirty || update.isPending}>
          Save changes
        </Button>
      </div>

      {showTos ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowTos(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowTos(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[80vh] max-w-2xl space-y-3 overflow-auto rounded-md border border-aegis-line bg-background p-6"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="document"
          >
            <h2 className="text-lg font-semibold">
              Data-handling addendum (v{CURRENT_TOS_VERSION})
            </h2>
            <div className="space-y-2 text-sm text-aegis-mute">
              <p>
                With prompt capture enabled, the broker will store the prompt and (optionally) the
                model's reasoning trace alongside each agent span. Data is scrubbed for common PII
                patterns (email, phone, SSN, credit card, bearer tokens) before persistence and
                AEAD-encrypted at rest with XChaCha20-Poly1305.
              </p>
              <p>
                Two copies are stored: a redacted copy visible to <code>auditor</code>+ roles and a
                raw copy visible only to <code>owner</code>, every raw read is itself recorded as an{' '}
                <code>audit_events</code> row.
              </p>
              <p>
                Retention defaults to 30 days; configurable up to 365. Customer-managed KMS keys are
                supported via the ARN field. Cascade-delete on customer removal is automatic.
              </p>
              <p>
                Acceptance is recorded against the version string above. Bumping the version on the
                broker side requires re-acceptance before capture resumes.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setShowTos(false)}>Close</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
