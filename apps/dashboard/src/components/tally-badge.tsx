import { cn } from '../lib/utils';

export function TallyBadge({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-1.5">
      <Icon className={cn('h-3.5 w-3.5', tone)} />
      <span className="text-aegis-mute">{label}</span>
      <span className={cn('tabular-nums', tone)}>{value.toString().padStart(2, '0')}</span>
    </div>
  );
}
