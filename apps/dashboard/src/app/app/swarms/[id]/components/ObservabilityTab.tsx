'use client';

import { AgentInventory } from './AgentInventory';
import { AnomalyBadges } from './AnomalyBadges';
import { BlastRadius } from './BlastRadius';
import { LiveFeed } from './LiveFeed';

export function ObservabilityTab({ swarmId }: { swarmId: string }) {
  return (
    <div className="space-y-6">
      <LiveFeed swarmId={swarmId} />
      <AnomalyBadges swarmId={swarmId} showAgent />
      <BlastRadius swarmId={swarmId} />
      <AgentInventory swarmId={swarmId} />
    </div>
  );
}
