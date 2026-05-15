'use client';

import { notFound, useParams } from 'next/navigation';
import { GuideTopic, type TopicId } from '../../../../components/nomos/guide';

const VALID_TOPICS = new Set<string>([
  'what-is-nomos',
  'mental-model',
  'quickstart',
  'connections',
  'apps',
  'policies',
  'filesystem-ssh',
  'dynamic-intent',
  'step-up',
  'standing-grants',
  'audit',
  'swarms',
  'cloud',
  'sdk',
  'telegram',
  'organizations',
  'members',
  'invites',
  'faq',
]);

export default function GuideTopicPage() {
  const params = useParams();
  const topic = params?.topic as string;
  if (!VALID_TOPICS.has(topic)) notFound();
  return <GuideTopic topic={topic as TopicId} />;
}
