import React, { useEffect, useState } from 'react';
import { usePlant } from '../context/PlantContext';
import { ShieldAlert, CheckCircle, ArrowRight, Activity, Percent } from 'lucide-react';

interface PlantSummaryItem {
  plant_id: string;
  name: string;
  short_name: string;
  zone_count: number;
  highest_risk_level: string;
  active_alerts_count: number;
  compliance_score: number;
}

interface CrossPlantSummaryProps {
  onFocusPlant: () => void;
}

export const CrossPlantSummary: React.FC<CrossPlantSummaryProps> = ({ onFocusPlant }) => {
  const { setActivePlantId } = usePlant();
  const [summaries, setSummaries] = useState<PlantSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummaries = () => {
    fetch('/api/v1/plants/summary')
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch cross-plant summary.");
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setSummaries(data);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSummaries();
    const interval = setInterval(fetchSummaries, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleFocus = (plantId: string) => {
    setActivePlantId(plantId);
    onFocusPlant();
  };

  if (loading) {
    return (
      <div className="bg-theme-card border border-theme-border rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[350px] gap-3 shadow-sm backdrop-blur-md">
        <Activity className="h-8 w-8 text-theme-accent animate-pulse" />
        <span className="text-xs font-bold font-mono text-theme-text-secondary uppercase tracking-widest">
          Aggregating Cross-Plant Safety Metrics...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-theme-risk-crit-bg border border-theme-risk-crit-border rounded-3xl p-8 text-center text-theme-risk-crit-text text-xs font-mono font-semibold shadow-sm">
        Failed to load cross-plant summary: {error}
      </div>
    );
  }

  const getRiskColorClasses = (level: string) => {
    switch (level) {
      case 'critical': return 'text-theme-risk-crit-text bg-theme-risk-crit-bg border-theme-risk-crit-border glow-red';
      case 'high':     return 'text-theme-risk-high-text bg-theme-risk-high-bg border-theme-risk-high-border glow-orange';
      case 'medium':   return 'text-theme-risk-med-text bg-theme-risk-med-bg border-theme-risk-med-border glow-yellow';
      default:         return 'text-theme-risk-low-text bg-theme-risk-low-bg border-theme-risk-low-border glow-green';
    }
  };

  const getComplianceColorClasses = (score: number) => {
    if (score >= 90) return 'text-theme-risk-low-text bg-theme-risk-low-bg border-theme-risk-low-border';
    if (score >= 75) return 'text-theme-risk-med-text bg-theme-risk-med-bg border-theme-risk-med-border';
    return 'text-theme-risk-crit-text bg-theme-risk-crit-bg border-theme-risk-crit-border';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5 px-1">
        <h2 className="text-xs font-black font-mono tracking-widest text-theme-text-muted uppercase">
          Multi-Plant Operations Summary
        </h2>
        <p className="text-xs text-theme-text-secondary font-medium">
          Real-time safety and regulatory compliance statuses across all active industrial facilities.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {summaries.map((s) => (
          <div 
            key={s.plant_id}
            className="card-soft-base p-6 flex flex-col justify-between"
          >
            <div className="space-y-6">
              {/* Header: Plant Name & Short badge */}
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="text-base font-extrabold text-theme-text font-sans tracking-tight m-0">
                    {s.name}
                  </h3>
                  <span className="text-[10px] font-mono font-bold tracking-wider text-theme-text-muted uppercase mt-1 block">
                    ID: {s.plant_id} — {s.zone_count} Monitoring Zones
                  </span>
                </div>
                <span className="text-[10px] font-mono font-black bg-theme-accent-bg border border-theme-accent-light px-2.5 py-0.5 rounded-full text-theme-accent">
                  {s.short_name}
                </span>
              </div>

              {/* Status metrics grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Safety risk card */}
                <div className={`border p-4 rounded-2xl flex flex-col gap-2.5 transition-all ${getRiskColorClasses(s.highest_risk_level)}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-extrabold tracking-wider uppercase opacity-85">
                      SAFETY LEVEL
                    </span>
                    {s.highest_risk_level === 'critical' || s.highest_risk_level === 'high' ? (
                      <ShieldAlert className="h-4 w-4 animate-bounce" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-black font-mono uppercase block">
                      {s.highest_risk_level}
                    </span>
                    <span className="text-[10px] opacity-80 font-semibold font-mono">
                      {s.active_alerts_count} active alert(s)
                    </span>
                  </div>
                </div>

                {/* Compliance score card */}
                <div className={`border p-4 rounded-2xl flex flex-col gap-2.5 transition-all ${getComplianceColorClasses(s.compliance_score)}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-extrabold tracking-wider uppercase opacity-85">
                      COMPLIANCE SCORE
                    </span>
                    <Percent className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-black font-mono block">
                      {s.compliance_score.toFixed(0)}%
                    </span>
                    <span className="text-[10px] opacity-80 font-semibold font-mono">
                      {s.compliance_score >= 90 ? 'Statutory Compliant' : 'Audit Gaps Flagged'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Compliance progress bar */}
              <div className="space-y-2 bg-theme-bg-alt p-4 rounded-2xl border border-theme-border">
                <div className="flex justify-between text-[10px] font-mono font-bold text-theme-text-secondary">
                  <span>FACILITY COMPLIANCE RATING</span>
                  <span>{s.compliance_score.toFixed(0)} / 100</span>
                </div>
                <div className="h-1.5 bg-theme-border rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      s.compliance_score >= 90 ? 'bg-theme-risk-low' :
                      s.compliance_score >= 75 ? 'bg-theme-risk-med' : 'bg-theme-risk-crit'
                    }`}
                    style={{ width: `${s.compliance_score}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Action button */}
            <button
              onClick={() => handleFocus(s.plant_id)}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-theme-accent hover:bg-theme-accent-hover text-xs font-bold font-mono tracking-tight text-white py-3 rounded-2xl shadow-md shadow-theme-accent/20 hover:scale-[1.01] transition-all active:scale-[0.98] group"
            >
              Enter Plant Console
              <ArrowRight className="h-3.5 w-3.5 text-white group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
