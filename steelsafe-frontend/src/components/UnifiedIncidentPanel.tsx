import React, { useState } from 'react';
import { ShieldAlert, CheckCircle, Clock } from 'lucide-react';

interface UnifiedIncidentPanelProps {
  zoneId: string;
  zoneName: string;
  riskScore: number;
  riskLevel: string;
  triggeredRules: string | null;
  explanation: string;
  virtualTime: Date;
  plantId: string;
  onAcknowledge: (operatorName: string) => void;
}

export function UnifiedIncidentPanel({
  zoneName,
  riskScore,
  riskLevel,
  triggeredRules,
  explanation,
  virtualTime,
  plantId,
  onAcknowledge,
}: UnifiedIncidentPanelProps) {
  const [operatorName, setOperatorName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorName.trim()) {
      setError('Operator name is required.');
      return;
    }
    onAcknowledge(operatorName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-theme-card border border-theme-risk-crit-border rounded-3xl p-6 shadow-2xl flex flex-col gap-4 relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-12 -left-12 w-24 h-24 bg-red-500/10 rounded-full blur-xl" />
        
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-theme-border pb-3.5">
          <div className="p-2.5 rounded-2xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400">
            <ShieldAlert className="h-6 w-6 animate-bounce" />
          </div>
          <div>
            <span className="text-[9px] font-mono font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">
              CRITICAL ESCALATION ALARM
            </span>
            <h3 className="text-sm font-extrabold text-theme-text uppercase tracking-wide mt-0.5">
              Incident Detected in {zoneName}
            </h3>
          </div>
        </div>

        {/* Incident Summary Card */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-theme-well border border-theme-border rounded-2xl p-3 text-center">
            <span className="text-[9px] font-mono font-bold text-theme-text-muted uppercase">Risk Score</span>
            <h4 className="text-2xl font-black font-mono text-red-600 mt-0.5">{riskScore.toFixed(0)}/100</h4>
          </div>
          <div className="bg-theme-well border border-theme-border rounded-2xl p-3 text-center">
            <span className="text-[9px] font-mono font-bold text-theme-text-muted uppercase">Risk Level</span>
            <h4 className="text-2xl font-black font-mono text-red-600 mt-0.5 uppercase">{riskLevel}</h4>
          </div>
        </div>

        {/* Incident details */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-mono font-semibold text-theme-text-muted">
            <Clock className="h-3.5 w-3.5" />
            <span>Logged at: {virtualTime ? new Date(virtualTime).toLocaleTimeString() : 'N/A'}</span>
            <span>•</span>
            <span className="uppercase">Plant: {plantId.replace('plant_', '').replace('_', ' ')}</span>
          </div>

          {triggeredRules && (
            <div className="flex flex-wrap gap-1 mt-1">
              {triggeredRules.split(',').map(rule => (
                <span key={rule} className="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-[9px] font-mono font-bold text-red-600 dark:text-red-400 uppercase">
                  Rule {rule}
                </span>
              ))}
            </div>
          )}

          <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-950/35 p-3 rounded-2xl">
            <p className="text-[10px] text-theme-text-secondary leading-relaxed font-semibold">
              {explanation}
            </p>
          </div>
        </div>

        {/* Acknowledge Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-3 border-t border-theme-border">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-theme-text-secondary">
              Operator Name / Initials
            </label>
            <input
              type="text"
              value={operatorName}
              onChange={(e) => {
                setOperatorName(e.target.value);
                setError('');
              }}
              placeholder="e.g. D. Mani"
              className="bg-theme-well text-xs text-theme-text px-3 py-2 rounded-xl border border-theme-border focus:outline-none focus:border-theme-accent font-semibold"
            />
            {error && (
              <span className="text-[9px] font-bold text-red-500">{error}</span>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/20 transition-all active:scale-98"
          >
            <CheckCircle className="h-4 w-4" />
            Acknowledge Escalation
          </button>
        </form>
      </div>
    </div>
  );
}
