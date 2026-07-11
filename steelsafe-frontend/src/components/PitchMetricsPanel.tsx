import { useState, useEffect } from 'react';
import { TrendingUp, ShieldAlert, Award, Cpu, AlertTriangle } from 'lucide-react';
import { usePlant } from '../context/PlantContext';
import type { ComparisonMetrics, ComparisonRow } from '../hooks/usePlantData';

interface PitchMetricsPanelProps {
  comparisonMetrics: ComparisonMetrics | null;
}

function formatTime(isoStr: string | null): string {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function LeadTimeBadge({ minutes, isNearMiss }: { minutes: number | null; isNearMiss: boolean }) {
  if (isNearMiss) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-theme-gray-bg text-theme-gray-text border border-theme-gray-border">
        NEAR-MISS
      </span>
    );
  }
  if (minutes === null) {
    return <span className="text-theme-text-muted text-[10px]">N/A</span>;
  }
  if (minutes > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-theme-risk-low-bg text-theme-risk-low-text border border-theme-risk-low-border">
        <TrendingUp className="h-2.5 w-2.5" />+{minutes.toFixed(1)}m
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-theme-risk-high-bg text-theme-risk-high-text border border-theme-risk-high-border">
      {minutes.toFixed(1)}m
    </span>
  );
}

function NearMissBadge({ row }: { row: ComparisonRow }) {
  if (!row.is_near_miss || !row.near_miss_result) return null;
  const { discipline_pass, peak_level, peak_score } = row.near_miss_result;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${
      discipline_pass
        ? 'bg-theme-risk-low-bg text-theme-risk-low-text border-theme-risk-low-border'
        : 'bg-theme-risk-crit-bg text-theme-risk-crit-text border-theme-risk-crit-border'
    }`}>
      {discipline_pass ? '✓ PASS' : '✗ FAIL'} ({peak_level.toUpperCase()} {peak_score.toFixed(0)})
    </span>
  );
}

function FPBar({ rate, color }: { rate: number; color: 'emerald' | 'orange' }) {
  const pct = Math.min(rate * 10, 100); // scale: 10% rate = full bar
  const colorMap = {
    emerald: 'bg-theme-risk-low',
    orange: 'bg-theme-risk-high',
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-theme-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colorMap[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-mono font-bold w-12 text-right ${
        color === 'emerald' ? 'text-theme-risk-low-text' : 'text-theme-risk-high-text'
      }`}>
        {rate.toFixed(2)}%
      </span>
    </div>
  );
}

export function PitchMetricsPanel({ comparisonMetrics }: PitchMetricsPanelProps) {
  const { activePlantId } = usePlant();
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({});
  
  useEffect(() => {
    if (!activePlantId) return;
    fetch(`/api/v1/zones?plant_id=${activePlantId}`)
      .then((r) => r.json())
      .then((data: any[]) => {
        const mapping: Record<string, string> = {};
        data.forEach((z) => {
          mapping[z.zone_id] = z.name;
        });
        setZoneNames(mapping);
      })
      .catch((e) => console.warn(e));
  }, [activePlantId]);

  const isLoaded = !!comparisonMetrics;
  const fps = comparisonMetrics?.false_positive_summary;
  const agg = comparisonMetrics?.aggregate;
  const rows = comparisonMetrics?.comparison_rows ?? [];
  const nmDiscipline = comparisonMetrics?.near_miss_discipline ?? [];
  const nmAllPass = nmDiscipline.length > 0 && nmDiscipline.every((r) => r.discipline_pass);

  const incidentRows = rows.filter((r) => !r.is_near_miss && r.lead_time_minutes != null);
  const bestLead = incidentRows.length > 0 ? Math.max(...incidentRows.map((r) => r.lead_time_minutes!)) : null;
  const avgLead = agg?.avg_compound_lead_time_minutes ?? null;

  return (
    <div
      id="pitch-metrics-panel"
      className="card-soft-base p-6 animate-fadeIn"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5 border-b border-theme-border pb-4">
        <div>
          <h2 className="text-xs font-black font-mono tracking-widest text-theme-text-muted uppercase flex items-center gap-1.5">
            <Award className="h-4 w-4 text-theme-accent" />
            Compound Engine vs. Baseline Detector — Performance Metrics
          </h2>
          <p className="text-[10px] text-theme-text-secondary font-semibold mt-1">
            {isLoaded
              ? `Live data · ${comparisonMetrics.total_scenarios} scenarios (${comparisonMetrics.incident_scenarios} incident + ${comparisonMetrics.near_miss_scenarios} near-miss)`
              : 'Loading comparison data from API...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLoaded && (
            <span className="text-[9px] text-theme-text-muted font-bold font-mono uppercase">
              📊 Benchmark Ready
            </span>
          )}
          <div className="text-[10px] text-theme-accent bg-theme-accent-bg border border-theme-accent-light px-2.5 py-0.5 rounded-full font-bold font-mono flex items-center gap-1">
            <Cpu className="h-3 w-3" />PREDICTIVE AI
          </div>
        </div>
      </div>

      {/* Top KPI Cards (inspired by reference mockup) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {/* KPI 1: Lead Time */}
        <div className="bg-theme-risk-low-bg border border-theme-risk-low-border rounded-2xl p-4 flex gap-3.5 items-center">
          <div className="p-2.5 bg-theme-risk-low-border rounded-xl text-theme-risk-low-text shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] text-theme-text-secondary font-bold uppercase tracking-wider">Early Detection Lead-Time</div>
            <div className="text-base font-black text-theme-risk-low-text mt-0.5">
              {isLoaded && bestLead !== null ? `+${bestLead.toFixed(1)} Min` : <span className="text-theme-text-muted text-xs">Loading…</span>}
            </div>
            <div className="text-[9px] text-theme-text-secondary mt-0.5 font-semibold leading-tight">
              {isLoaded && avgLead !== null && (
                <>Avg lead: <span className="text-theme-risk-low-text">+{avgLead.toFixed(1)}m</span> across {comparisonMetrics.incident_scenarios} incidents</>
              )}
            </div>
          </div>
        </div>

        {/* KPI 2: False Positive Rate */}
        <div className="bg-theme-accent-bg border border-theme-accent-light rounded-2xl p-4 flex gap-3.5 items-center">
          <div className="p-2.5 bg-theme-accent-light-bg rounded-xl text-theme-accent shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] text-theme-text-secondary font-bold uppercase tracking-wider">False Alarm Rate (Compound)</div>
            <div className="text-base font-black text-theme-accent mt-0.5">
              {isLoaded && fps ? `${fps.compound_fp_rate_pct.toFixed(2)}%` : <span className="text-theme-text-muted text-xs">Loading…</span>}
            </div>
            <div className="text-[9px] text-theme-text-secondary mt-0.5 font-semibold leading-tight">
              {isLoaded && fps && (
                <>vs. baseline <span className="text-theme-risk-high-text">{fps.baseline_fp_rate_pct.toFixed(2)}%</span> ({fps.safe_period_evaluations.toLocaleString()} evals)</>
              )}
            </div>
          </div>
        </div>

        {/* KPI 3: Near-Miss + Standards */}
        <div className="bg-theme-purple-bg border border-theme-purple-border rounded-2xl p-4 flex gap-3.5 items-center">
          <div className="p-2.5 bg-theme-purple-border rounded-xl text-theme-purple-text shrink-0">
            <Award className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] text-theme-text-secondary font-bold uppercase tracking-wider">Near-Miss Discipline</div>
            <div className="text-base font-black text-theme-purple-text mt-0.5">
              {isLoaded
                ? (nmAllPass ? '✓ All Pass' : '⚠ Review')
                : <span className="text-theme-text-muted text-xs">Loading…</span>}
            </div>
            <div className="text-[9px] text-theme-text-secondary mt-0.5 font-semibold leading-tight">
              3 Standards Indexed · OISD 137, Factories Act, Gas Safety SOP
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      {isLoaded ? (
        <div className="overflow-x-auto rounded-2xl border border-theme-border shadow-sm bg-theme-card">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-theme-bg-alt border-b border-theme-border">
                <th className="text-left px-4 py-3 text-theme-text-secondary font-bold uppercase tracking-wider">Scenario</th>
                <th className="text-left px-4 py-3 text-theme-text-secondary font-bold uppercase tracking-wider">Zone</th>
                <th className="text-left px-4 py-3 text-theme-text-secondary font-bold uppercase tracking-wider">Compound Flagged</th>
                <th className="text-left px-4 py-3 text-theme-text-secondary font-bold uppercase tracking-wider">Baseline Alarm</th>
                <th className="text-center px-4 py-3 text-theme-text-secondary font-bold uppercase tracking-wider">Lead Time</th>
                <th className="text-center px-4 py-3 text-theme-text-secondary font-bold uppercase tracking-wider">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.scenario_id}
                  className={`border-b border-theme-border-muted transition-colors hover:bg-theme-card-hover ${
                    row.is_near_miss ? 'bg-theme-bg-alt/30' : ''
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-bold text-theme-text">{row.scenario_id.replace('_', ' ').toUpperCase()}</div>
                    <div className="text-[9px] text-theme-text-muted leading-tight mt-0.5 max-w-[160px] truncate" title={row.label}>
                      {row.label}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-theme-text-secondary font-mono font-semibold">
                    {zoneNames[row.zone_id] ?? row.zone_id}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.is_near_miss ? (
                      <span className="text-theme-text-secondary italic">
                        {row.near_miss_result?.compound_flagged
                          ? <span className="text-theme-risk-high-text font-bold">{formatTime(row.compound_first_flag)}</span>
                          : <span className="text-theme-risk-low-text font-bold">Not flagged ✓</span>
                        }
                      </span>
                    ) : row.compound_first_flag ? (
                      <span className="text-theme-risk-low-text font-mono font-bold">{formatTime(row.compound_first_flag)}</span>
                    ) : (
                      <span className="text-theme-risk-crit-text font-semibold italic">Not detected</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.baseline_first_flag ? (
                      <span className="text-theme-risk-high-text font-mono font-bold">{formatTime(row.baseline_first_flag)}</span>
                    ) : (
                      <span className="text-theme-text-muted italic">
                        {row.is_near_miss ? 'Silent ✓' : 'Missed entirely'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <LeadTimeBadge minutes={row.lead_time_minutes} isNearMiss={row.is_near_miss} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.is_near_miss ? (
                      <NearMissBadge row={row} />
                    ) : row.compound_first_flag ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-theme-risk-low-bg text-theme-risk-low-text border border-theme-risk-low-border">
                        ✓ DETECTED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-theme-risk-crit-bg text-theme-risk-crit-text border border-theme-risk-crit-border">
                        ✗ MISSED
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-theme-text-muted text-xs italic animate-pulse">
          Loading comparison data… (requires POST /admin/regenerate to have been run)
        </div>
      )}

      {/* False Positive Comparison Bars */}
      {isLoaded && fps && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-theme-bg border border-theme-border rounded-2xl p-4">
            <div className="text-[9px] font-bold text-theme-text-secondary uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-theme-text-muted" /> False Positive Rate — Safe Periods
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[9px] text-theme-text-secondary mb-1 font-semibold">
                  <span>Compound Engine</span>
                  <span className="text-theme-text-muted">{fps.compound_false_positives} / {fps.safe_period_evaluations.toLocaleString()} evals</span>
                </div>
                <FPBar rate={fps.compound_fp_rate_pct} color="emerald" />
              </div>
              <div>
                <div className="flex justify-between text-[9px] text-theme-text-secondary mb-1 font-semibold">
                  <span>Baseline (Single-Sensor)</span>
                  <span className="text-theme-text-muted">{fps.baseline_false_positives} / {fps.safe_period_evaluations.toLocaleString()} evals</span>
                </div>
                <FPBar rate={fps.baseline_fp_rate_pct} color="orange" />
              </div>
            </div>
          </div>

          <div className="bg-theme-bg border border-theme-border rounded-2xl p-4 flex flex-col justify-between">
            <div className="text-[9px] font-bold text-theme-text-secondary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-theme-text-muted" /> Detection Summary
            </div>
            <div className="space-y-2 text-[10px] font-semibold text-theme-text-secondary">
              <div className="flex justify-between">
                <span>Compound detected</span>
                <span className="text-theme-risk-low-text font-bold">
                  {agg?.scenarios_compound_detected ?? '—'} / {comparisonMetrics?.incident_scenarios ?? '—'} incidents
                </span>
              </div>
              <div className="flex justify-between">
                <span>Baseline missed entirely</span>
                <span className="text-theme-risk-high-text font-bold">
                  {agg?.scenarios_baseline_missed ?? '—'} / {comparisonMetrics?.incident_scenarios ?? '—'} incidents
                </span>
              </div>
              <div className="flex justify-between">
                <span>Avg lead time advantage</span>
                <span className="text-theme-risk-low-text font-bold font-mono">
                  {avgLead !== null ? `+${avgLead.toFixed(1)} min` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Near-miss discipline</span>
                <span className={`font-bold ${nmAllPass ? 'text-theme-risk-low-text' : 'text-theme-risk-crit-text'}`}>
                  {nmAllPass ? '✓ All scenarios PASS' : '⚠ Review required'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
