import type { ZoneDetail } from '../hooks/usePlantData';
import { ForecastPanel } from './ForecastPanel';
import { 
  Skull, Flame, Thermometer, Gauge, 
  Users, FileText, AlertTriangle, ShieldCheck, ChevronRight,
  TrendingDown, Clock, DollarSign, Network, Zap
} from 'lucide-react';

const CO_SECONDARY_PPM = 35.0;
const CO_HIGH_PPM = 100.0;
const H2S_SECONDARY_PPM = 5.0;
const H2S_HIGH_PPM = 10.0;

interface DetailPanelProps {
  zoneId: string | null;
  zoneName: string;
  detail: ZoneDetail | null;
}

export function DetailPanel({ zoneId, zoneName, detail }: DetailPanelProps) {
  
  if (!zoneId) {
    return (
      <div className="bg-theme-card border border-theme-border rounded-3xl p-8 flex flex-col items-center justify-center text-center h-full shadow-sm backdrop-blur-md">
        <ShieldCheck className="h-12 w-12 text-theme-text-muted mb-3" />
        <h3 className="text-theme-text font-bold mb-1">No Zone Selected</h3>
        <p className="text-theme-text-secondary text-xs max-w-[200px] leading-relaxed">
          Click any area on the plant floor plan to monitor live telemetry.
        </p>
      </div>
    );
  }

  const getRiskColorClasses = (level: string) => {
    if (level === 'critical') return 'text-theme-risk-crit-text border-theme-risk-crit-border bg-theme-risk-crit-bg';
    if (level === 'high') return 'text-theme-risk-high-text border-theme-risk-high-border bg-theme-risk-high-bg';
    if (level === 'medium') return 'text-theme-risk-med-text border-theme-risk-med-border bg-theme-risk-med-bg';
    return 'text-theme-risk-low-text border-theme-risk-low-border bg-theme-risk-low-bg';
  };

  const getCOColor = (val: number) => {
    if (val >= CO_HIGH_PPM) return 'text-theme-risk-crit-text font-bold';
    if (val >= CO_SECONDARY_PPM) return 'text-theme-risk-high-text font-bold';
    return 'text-theme-text';
  };

  const getH2SColor = (val: number) => {
    if (val >= H2S_HIGH_PPM) return 'text-theme-risk-crit-text font-bold';
    if (val >= H2S_SECONDARY_PPM) return 'text-theme-risk-high-text font-bold';
    return 'text-theme-text';
  };

  return (
    <div className="card-soft-base p-6 flex flex-col h-full overflow-y-auto">
      {/* Title */}
      <div className="border-b border-theme-border pb-4 mb-5">
        <span className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">Live Telemetry</span>
        <h2 className="text-lg font-extrabold tracking-tight text-theme-text">{zoneName}</h2>
      </div>

      {detail ? (
        <div className="flex-1 flex flex-col gap-5">
          {/* Risk Level Callout */}
          <div className={`border p-4 rounded-2xl flex gap-3 items-start ${getRiskColorClasses(detail.riskLevel)}`}>
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                {detail.riskLevel} Risk State ({detail.riskScore.toFixed(0)}/100)
              </div>
              {detail.triggeredRules && (
                <div className="text-[9px] font-mono mt-1 opacity-90 font-bold">
                  Rules Fired: {detail.triggeredRules}
                </div>
              )}
            </div>
          </div>

          {/* Cost/Impact Translation Block */}
          {detail.costImpact && detail.riskLevel !== 'low' && (
            <div className="border border-theme-risk-med-border bg-theme-risk-med-bg/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4 text-theme-risk-med-text shrink-0" />
                <span className="text-[9px] font-bold text-theme-risk-med-text uppercase tracking-wider">
                  Business Impact — Estimates
                </span>
              </div>
              <div className="text-xs font-bold text-theme-risk-med-text leading-snug">
                {detail.costImpact.headline}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-theme-card border border-theme-risk-med-border rounded-xl p-2.5 shadow-sm">
                  <div className="flex items-center gap-1 text-[9px] text-theme-risk-med-text mb-0.5">
                    <Clock className="h-3 w-3" />
                    <span>Downtime Estimate</span>
                  </div>
                  <div className="text-xs font-bold text-theme-risk-med-text">
                    {detail.costImpact.downtime_estimate}
                  </div>
                </div>
                <div className="bg-theme-card border border-theme-risk-med-border rounded-xl p-2.5 shadow-sm">
                  <div className="flex items-center gap-1 text-[9px] text-theme-risk-med-text mb-0.5">
                    <DollarSign className="h-3 w-3" />
                    <span>Financial Exposure</span>
                  </div>
                  <div className="text-xs font-bold text-theme-risk-med-text">
                    {detail.costImpact.financial_exposure}
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-theme-text-secondary leading-normal">
                {detail.costImpact.impact_language}
              </p>
              {detail.costImpact.immediate_actions.length > 0 && (
                <div>
                  <div className="text-[9px] font-black text-theme-risk-med-text uppercase tracking-wider mb-1">Immediate Actions</div>
                  <ul className="space-y-0.5">
                    {detail.costImpact.immediate_actions.slice(0, 3).map((action, i) => (
                      <li key={i} className="text-[9px] text-theme-text-secondary flex gap-1.5">
                        <span className="text-theme-risk-med shrink-0 font-bold">→</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="text-[8px] text-theme-text-muted italic border-t border-theme-risk-med-border/60 pt-1.5">
                ⚠ {detail.costImpact.illustrative_basis}
              </div>
            </div>
          )}

          {/* Sensor Grid */}
          <div>
            <h3 className="text-[10px] uppercase font-bold text-theme-text-muted mb-2.5 tracking-wider">Atmospheric Sensors</h3>
            {detail.sensor ? (
              <div className="grid grid-cols-2 gap-3">
                {/* CO sensor */}
                <div className="bg-theme-bg-alt p-3 rounded-2xl border border-theme-border shadow-sm">
                  <div className="flex items-center gap-1.5 text-theme-text-secondary text-[10px] mb-1 font-semibold">
                    <Flame className="h-3.5 w-3.5 text-theme-risk-high" />
                    <span>CO</span>
                  </div>
                  <div className={`text-base font-bold font-mono ${getCOColor(detail.sensor.co_ppm)}`}>
                    {detail.sensor.co_ppm.toFixed(1)} <span className="text-[10px] font-normal text-theme-text-secondary">ppm</span>
                  </div>
                </div>

                {/* H2S sensor */}
                <div className="bg-theme-bg-alt p-3 rounded-2xl border border-theme-border shadow-sm">
                  <div className="flex items-center gap-1.5 text-theme-text-secondary text-[10px] mb-1 font-semibold">
                    <Skull className="h-3.5 w-3.5 text-theme-text" />
                    <span>H2S</span>
                  </div>
                  <div className={`text-base font-bold font-mono ${getH2SColor(detail.sensor.h2s_ppm)}`}>
                    {detail.sensor.h2s_ppm.toFixed(3)} <span className="text-[10px] font-normal text-theme-text-secondary">ppm</span>
                  </div>
                </div>

                {/* Temperature */}
                <div className="bg-theme-bg-alt p-3 rounded-2xl border border-theme-border shadow-sm">
                  <div className="flex items-center gap-1.5 text-theme-text-secondary text-[10px] mb-1 font-semibold">
                    <Thermometer className="h-3.5 w-3.5 text-theme-risk-crit" />
                    <span>Temp</span>
                  </div>
                  <div className="text-base font-bold font-mono text-theme-text">
                    {detail.sensor.temperature_c.toFixed(1)} <span className="text-[10px] font-normal text-theme-text-secondary">°C</span>
                  </div>
                </div>

                {/* Pressure */}
                <div className="bg-theme-bg-alt p-3 rounded-2xl border border-theme-border shadow-sm">
                  <div className="flex items-center gap-1.5 text-theme-text-secondary text-[10px] mb-1 font-semibold">
                    <Gauge className="h-3.5 w-3.5 text-theme-blue" />
                    <span>Pressure</span>
                  </div>
                  <div className="text-base font-bold font-mono text-theme-text">
                    {detail.sensor.pressure_kpa.toFixed(2)} <span className="text-[10px] font-normal text-theme-text-secondary">kPa</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-theme-text-muted italic p-4 bg-theme-bg-alt rounded-2xl border border-theme-border">
                No active sensor readings.
              </div>
            )}
          </div>

          {/* Operational Metrics (Workers, Permits) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-theme-bg-alt p-3 rounded-2xl border border-theme-border shadow-sm">
              <div className="flex items-center gap-1.5 text-theme-text-secondary text-[10px] mb-1 font-semibold">
                <Users className="h-3.5 w-3.5 text-theme-text-secondary" />
                <span>Personnel</span>
              </div>
              <div className="text-base font-bold font-mono text-theme-text">
                {detail.workerCount} <span className="text-[10px] text-theme-text-muted font-normal">active</span>
              </div>
            </div>
            <div className="bg-theme-bg-alt p-3 rounded-2xl border border-theme-border shadow-sm">
              <div className="flex items-center gap-1.5 text-theme-text-secondary text-[10px] mb-1 font-semibold">
                <FileText className="h-3.5 w-3.5 text-theme-text-secondary" />
                <span>Permits</span>
              </div>
              <div className="text-base font-bold font-mono text-theme-text">
                {detail.activePermits.length} <span className="text-[10px] text-theme-text-muted font-normal">issued</span>
              </div>
            </div>
          </div>

          {/* Active Permits Detail */}
          {detail.activePermits.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase font-bold text-theme-text-muted mb-2 tracking-wider">Active Permits</h3>
              <div className="flex flex-col gap-2">
                {detail.activePermits.map((p, idx) => (
                  <div key={idx} className="bg-theme-bg-alt border border-theme-border p-3 rounded-2xl text-xs shadow-sm">
                    <div className="flex justify-between font-bold text-theme-text">
                      <span>{p.permit_ref}</span>
                      <span className="text-[9px] font-mono font-bold bg-theme-accent-bg border border-theme-accent-light px-2 py-0.2 rounded-full text-theme-accent capitalize">
                        {p.permit_type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-[10px] text-theme-text-muted mt-1">Issued to: {p.issued_to}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Intervention */}
          {detail.intervention && detail.riskLevel !== 'low' && (
            <div className="border-t border-theme-border pt-4">
              <h3 className="text-[10px] uppercase font-bold text-theme-text-muted mb-2.5 tracking-wider">Recommended Intervention</h3>
              <div className="bg-theme-accent-bg border border-theme-accent-light p-4 rounded-2xl text-xs leading-relaxed text-theme-accent shadow-sm">
                <div className="font-bold flex items-center gap-1.5 mb-1.5 text-[10px] text-theme-accent uppercase tracking-wider">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-theme-accent" />
                  Counterfactual Resolve Path
                </div>
                <p className="text-theme-text font-semibold">{detail.intervention.action}</p>
                <div className="text-[10px] text-theme-text-secondary mt-2 font-mono flex items-center gap-2">
                  <span>Current: <strong className="text-theme-risk-crit">{detail.intervention.original_score.toFixed(0)}</strong></span>
                  <ChevronRight className="h-3 w-3 text-theme-text-muted" />
                  <span>Projected: <strong className="text-theme-risk-low">{detail.intervention.projected_score.toFixed(0)}</strong></span>
                  <span className="text-theme-text-muted ml-auto font-bold">({detail.intervention.projected_score < 70 ? "Feasible Clear" : "Partial Mitigation"})</span>
                </div>
              </div>
            </div>
          )}

          {/* AI Context Card — Knowledge Graph + Shift Fatigue */}
          {detail.signalSnapshot && (
            (() => {
              const snap = detail.signalSnapshot;
              const graphMatches = snap.knowledge_graph_matches?.filter(m => !m.is_near_miss) ?? [];
              const fatigueHours = snap.fatigue_hours_into_shift ?? 0;
              const fatigueBump  = snap.fatigue_score_bump ?? 0;
              const hasGraph    = graphMatches.length > 0 && detail.riskScore > 0;
              const hasFatigue  = fatigueBump > 0;
              if (!hasGraph && !hasFatigue) return null;
              return (
                <div className="border border-theme-violet-border bg-theme-violet-bg/60 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Network className="h-3.5 w-3.5 text-theme-violet-text shrink-0" />
                    <span className="text-[9px] font-bold text-theme-violet-text uppercase tracking-wider">
                      AI Context — Relationship Reasoning
                    </span>
                  </div>

                  {/* Knowledge Graph Matches */}
                  {hasGraph && (
                    <div className="space-y-1.5">
                      <div className="text-[9px] font-black text-theme-violet-text uppercase tracking-wider">
                        Historical Pattern Match ({graphMatches.length})
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {graphMatches.slice(0, 3).map((m, i) => (
                          <div key={i} className="bg-theme-card border border-theme-violet-border rounded-xl p-2.5 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[11px] font-bold text-theme-violet-text leading-tight">
                                {m.scenario_label}
                              </div>
                              <div className="text-[9px] font-mono text-theme-violet-text font-bold">
                                {m.match_strength}/3
                              </div>
                            </div>
                            <div className="text-[9px] text-theme-text-muted mt-0.5">
                              matched: {m.matched_on.map(d => d.split(':')[0]).join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shift Fatigue Amplifier */}
                  {hasFatigue && (
                    <div className="flex items-start gap-2 bg-theme-card border border-theme-violet-border rounded-xl p-2.5 shadow-sm">
                      <Zap className="h-3.5 w-3.5 text-theme-violet shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <div className="text-[10px] font-bold text-theme-text">
                          Shift Fatigue Amplifier
                        </div>
                        <div className="text-[9px] text-theme-text-secondary mt-0.5 font-medium leading-relaxed">
                          Workers are {fatigueHours.toFixed(1)}h into shift
                          &nbsp;&mdash; risk weighting +{fatigueBump} pts
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          )}


          {/* Phase 9: Predictive TTD Forecast */}
          {zoneId && (
            <ForecastPanel zoneId={zoneId} />
          )}

          {/* Explanation paragraph */}
          <div className="border-t border-theme-border pt-5 mt-auto">
            <h3 className="text-[10px] uppercase font-bold text-theme-text-muted mb-2 tracking-wider">AI Scorer Diagnostic</h3>
            <div className="bg-theme-bg-alt border border-theme-border p-4 rounded-2xl text-[10px] leading-relaxed text-theme-text-secondary font-mono">
              {detail.explanation}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-theme-text-muted text-xs italic">
          Loading telemetry for {zoneName}...
        </div>
      )}
    </div>
  );
}
