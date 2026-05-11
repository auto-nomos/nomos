'use client';

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

export default function NotificationsSettingsPage() {
  const utils = trpc.useUtils();
  const prefs = trpc.notificationPreferences.get.useQuery();
  const update = trpc.notificationPreferences.update.useMutation({
    onSuccess: () => utils.notificationPreferences.get.invalidate(),
  });

  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [webPushEnabled, setWebPushEnabled] = useState(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!prefs.data) return;
    setTelegramChatId(prefs.data.telegramChatId ?? '');
    setTelegramEnabled(prefs.data.telegramEnabled);
    setEmailEnabled(prefs.data.emailEnabled);
    setWebPushEnabled(prefs.data.webPushEnabled);
  }, [prefs.data]);

  async function handleSave() {
    await update.mutateAsync({
      telegramChatId: telegramChatId.length > 0 ? telegramChatId : null,
      telegramEnabled,
      emailEnabled,
      webPushEnabled,
    });
    setSavedAt(new Date());
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Notification preferences</h1>
        <p className="text-sm text-zinc-500">
          Choose which channels receive step-up approval prompts.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channels</CardTitle>
          <CardDescription>
            Web push + email are on by default. Telegram is opt-in and needs your numeric chat id.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={webPushEnabled}
              onChange={(e) => setWebPushEnabled(e.target.checked)}
            />
            <span className="text-sm">Web push (browser notification)</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
            />
            <span className="text-sm">Email</span>
          </label>

          <div className="space-y-2 rounded-md border border-zinc-200 p-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={telegramEnabled}
                onChange={(e) => setTelegramEnabled(e.target.checked)}
              />
              <span className="text-sm font-medium">Telegram</span>
            </label>
            <div className="space-y-1">
              <Label htmlFor="telegram-chat-id" className="text-xs text-zinc-500">
                Chat id
              </Label>
              <Input
                id="telegram-chat-id"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="e.g. 1234567890"
                disabled={!telegramEnabled}
              />
              <p className="text-xs text-zinc-500">
                Open <code>@credential_broker_bot</code> in Telegram and send <code>/start</code> —
                it replies with your numeric chat id.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={update.isPending || prefs.isLoading}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
            {savedAt ? (
              <span className="text-xs text-zinc-500">Saved at {savedAt.toLocaleTimeString()}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
