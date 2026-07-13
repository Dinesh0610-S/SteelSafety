
interface SystemHealthIndicatorProps {
  virtualTime: Date | null;
}

export function SystemHealthIndicator({ virtualTime }: SystemHealthIndicatorProps) {
  return (
    <div className="flex items-center gap-2 bg-theme-well border border-theme-border px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold shadow-sm shrink-0">
      <span className={`h-2 w-2 rounded-full ${virtualTime ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
      <span className="text-theme-text-secondary uppercase">
        {virtualTime ? "Telemetry Online" : "Telemetry Standby"}
      </span>
    </div>
  );
}
