'use client';

import { ActionGraph } from './ActionGraph';
import { ActionTimeline } from './ActionTimeline';
import { AgentInventory } from './AgentInventory';
import { AnomalyBadges } from './AnomalyBadges';
import { BlastRadius } from './BlastRadius';
import { LiveFeed } from './LiveFeed';

export function ObservabilityTab({ swarmId }: { swarmId: string }) {
  return (
    <div className="space-y-6">
      <ActionGraph swarmId={swarmId} />
      <ActionTimeline swarmId={swarmId} />
      <LiveFeed swarmId={swarmId} />
      <AnomalyBadges swarmId={swarmId} showAgent />
      <BlastRadius swarmId={swarmId} />
      <AgentInventory swarmId={swarmId} />
    </div>
  );
}
