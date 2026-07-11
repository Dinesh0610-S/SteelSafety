import { useState } from 'react';
import { Play, Pause, RotateCcw, Loader2 } from 'lucide-react';

interface PlaybackControlsProps {
  virtualTime: Date | null;
  isPlaying: boolean;
  speed: number;
  progressFraction: number;
  t0: Date | null;
  t8: Date | null;
  onTogglePlay: () => void;
  onSetSpeed: (speed: number) => void;
  onSeek: (fraction: number) => void;
  onReset: () => void;
  onRegenerateComplete: (newT0Str: string) => void;
}

export function PlaybackControls({
  virtualTime,
  isPlaying,
  speed,
  progressFraction,
  t0,
  t8,
  onTogglePlay,
  onSetSpeed,
  onSeek,
  onReset,
  onRegenerateComplete,
}: PlaybackControlsProps) {
  const [isResetting, setIsResetting] = useState<boolean>(false);

  const formatTime = (date: Date | null) => {
    if (!date) return '00:00:00';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const handleRegenerate = () => {
    setIsResetting(true);
    fetch('/api/v1/admin/regenerate', { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error("Reset failed");
        return res.json();
      })
      .then((data) => {
        onRegenerateComplete(data.t0_simulated);
        onReset();
      })
      .catch(() => {
        alert("Failed to connect to backend server. Is uvicorn running on port 8000?");
      })
      .finally(() => {
        setIsResetting(false);
      });
  };

  const speeds = [1, 10, 60, 180, 300]; // Multipliers (seconds per tick)

  const SHIFT_DURATION_S = 8 * 3600;

  return (
    <div className="card-soft-base bg-theme-card border border-theme-border p-6 relative z-10">
      <div className="flex flex-col gap-4">
        {/* Jump to Incidents row */}
        <div className="flex flex-wrap items-center gap-2 border-b border-theme-border-muted pb-3">
          <span className="text-[10px] uppercase font-bold text-theme-text-muted mr-2 select-none">Jump to Scenario:</span>
          <button
            onClick={() => onSeek(7140 / SHIFT_DURATION_S)}
            className="text-[10px] font-bold px-3.5 py-2 rounded-xl bg-theme-risk-high-bg border border-theme-risk-high-border text-theme-risk-high-text hover:bg-theme-risk-high-bg/80 transition-all shadow-sm"
            title="Jump to Scenario 1: Gas collection main leak during active hot work"
          >
            Incident 1: Gas Main Leak (02:00)
          </button>
          <button
            onClick={() => onSeek(16140 / SHIFT_DURATION_S)}
            className="text-[10px] font-bold px-3.5 py-2 rounded-xl bg-theme-risk-crit-bg border border-theme-risk-crit-border text-theme-risk-crit-text hover:bg-theme-risk-crit-bg/80 transition-all shadow-sm"
            title="Jump to Scenario 2: H2S spike during Oven Standpipe entry"
          >
            Incident 2: H2S Standpipe (04:30)
          </button>
          <button
            onClick={() => onSeek(22440 / SHIFT_DURATION_S)}
            className="text-[10px] font-bold px-3.5 py-2 rounded-xl bg-theme-risk-med-bg border border-theme-risk-med-border text-theme-risk-med-text hover:bg-theme-risk-med-bg/80 transition-all shadow-sm"
            title="Jump to Scenario 3: CO buildup during Charging Platform seal failure"
          >
            Incident 3: Charging Area (06:15)
          </button>
        </div>
        {/* Timeline Slider */}
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-theme-text-muted font-mono select-none">
            {formatTime(t0)}
          </span>
          <div className="flex-1 relative group py-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={progressFraction}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-theme-well-border rounded-lg appearance-none cursor-pointer accent-theme-accent hover:accent-theme-accent focus:outline-none transition-all"
            />
          </div>
          <span className="text-[10px] font-bold text-theme-text-muted font-mono select-none">
            {formatTime(t8)}
          </span>
        </div>

        {/* Lower Control Bar */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          {/* Virtual Time Clock */}
          <div className="flex items-center gap-3">
            <div className="bg-theme-well border border-theme-well-border px-4 py-2.5 rounded-2xl text-center min-w-[130px] shadow-sm">
              <span className="text-[9px] uppercase font-bold text-theme-text-muted block leading-none mb-1.5 select-none">Virtual Clock</span>
              <span className="text-base font-mono text-theme-accent font-extrabold leading-none tracking-wider">
                {formatTime(virtualTime)}
              </span>
            </div>
            <span className="text-[10px] text-theme-text-secondary font-semibold">
              Shift progress: {(progressFraction * 100).toFixed(1)}%
            </span>
          </div>

          {/* Player controls */}
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button
              onClick={onTogglePlay}
              disabled={isResetting}
              className="p-3 rounded-2xl bg-theme-accent hover:bg-theme-accent-hover text-theme-text-inverse shadow-md shadow-theme-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
            </button>

            {/* Speeds selector */}
            <div className="flex items-center bg-theme-well p-1 rounded-xl border border-theme-well-border">
              {speeds.map((s) => (
                <button
                  key={s}
                  onClick={() => onSetSpeed(s)}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                    speed === s
                      ? 'bg-theme-accent text-theme-text-inverse shadow-sm'
                      : 'text-theme-text-muted hover:text-theme-text'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Reset / Replay */}
          <div className="flex items-center gap-3">
            {/* Playback reset */}
            <button
              onClick={onReset}
              disabled={isResetting}
              className="flex items-center gap-2 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-theme-border hover:bg-theme-card-hover hover:text-theme-text transition-all text-theme-text-secondary disabled:opacity-50 shadow-sm active:scale-98"
              title="Reset current playback to start of shift"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Replay</span>
            </button>

            {/* Full Database Reset */}
            <button
              onClick={handleRegenerate}
              disabled={isResetting}
              className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl bg-theme-risk-crit-bg border border-theme-risk-crit-border hover:bg-theme-risk-crit-bg/80 text-theme-risk-crit-text transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
              title="Wipe database and regenerate simulation shift"
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Regenerating...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Demo (API)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
