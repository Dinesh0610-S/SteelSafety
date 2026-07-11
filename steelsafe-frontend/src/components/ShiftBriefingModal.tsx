/**
 * ShiftBriefingModal.tsx
 * =======================
 * Phase 9: Shift Handover Briefing Report modal.
 *
 * Generates and displays a comprehensive shift safety briefing report
 * fetched from /api/v1/report/shift-briefing. Designed for safety
 * officers to review before handing over to the next shift.
 *
 * Features:
 * - Full risk status for all zones
 * - Active permits and compliance gaps
 * - Open PPE violations
 * - TTD forecast summary
 * - Priority action items
 * - Print-optimized layout (via window.print)
 */

import { useState, useCallback } from 'react';
import {
  FileText, X, Printer, RefreshCw, Shield, AlertTriangle,
  CheckCircle, Users, FileWarning, BadgeAlert,
  TrendingUp, ChevronDown, ChevronUp, Info
} from 'lucide-react';
import { usePlant } from '../context/PlantContext';

// ---- Types ---------------------------------------------------------------

interface ZoneRisk {
  zone_id: string;
  zone_name: string;
  risk_score: number;
  risk_level: string;
  triggered_rules: string | null;
  explanation: string;
}

interface Permit {
  permit_ref: string;
  zone_id: string;
  zone_name: string;
  permit_type: string;
  issued_to: string;
  status: string;
  start_time: string;
  end_time: string;
}

interface ComplianceGap {
  id: number;
  category: string;
  deviation_type: string;
  description: string;
  severity: string;
  corrective_action: string;
  regulatory_requirement: string;
  citation: string;
  zone_id: string | null;
  zone_name: string;
}

interface PPEViolation {
  id: number;
  zone_id: string;
  zone_name: string;
  plant_id: string;
  timestamp: string;
  ppe_items_missing: string[];
  confidence_pct: number;
  detection_method: string;
  status: string;
  risk_score_at_time: number | null;
}

interface Forecast {
  zone_id: string;
  zone_name: string;
  overall_ttd_minutes: number | null;
  alert_level: string;
  trend_co: string;
  trend_h2s: string;
  co_ppm_current: number;
  h2s_ppm_current: number;
}

interface ActionItem {
  priority: string;
  action: string;
}

interface BriefingReport {
  report_type: string;
  generated_at: string;
  evaluation_time: string;
  plant_id: string;
  plant_name: string;
  workers_on_site: number;
  headline: string;
  compliance_score: number;
  zone_risks: ZoneRisk[];
  active_permits: Permit[];
  compliance_gaps: ComplianceGap[];
  ppe_violations_open: PPEViolation[];
  ppe_violations_acknowledged: PPEViolation[];
  forecasts: Forecast[];
  action_items: ActionItem[];
  summary: {
    critical_zones: string[];
    high_zones: string[];
    active_permits: number;
    compliance_gaps: number;
    ppe_open: number;
    forecast_imminent: number;
    forecast_warning: number;
    workers_on_site: number;
  };
}

// ---- Helper components ---------------------------------------------------

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-950/50 border-red-700/50 text-red-400',
    high:     'bg-orange-950/40 border-orange-700/40 text-orange-400',
    medium:   'bg-yellow-950/30 border-yellow-700/40 text-yellow-400',
    low:      'bg-emerald-950/20 border-emerald-700/30 text-emerald-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black font-mono uppercase ${styles[level] || styles.low}`}>
      {level}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    high:   'bg-red-950/50 border-red-700/50 text-red-400',
    medium: 'bg-amber-950/30 border-amber-700/40 text-amber-400',
    low:    'bg-theme-card border-theme-border text-theme-text-muted',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded-full border text-[7px] font-black font-mono uppercase ${styles[severity] || styles.low}`}>
      {severity}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    CRITICAL: 'bg-red-950/50 border-red-700/50 text-red-400',
    HIGH:     'bg-orange-950/40 border-orange-700/40 text-orange-400',
    INFO:     'bg-theme-accent-bg border-theme-accent-light text-theme-accent',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black font-mono uppercase shrink-0 ${styles[priority] || styles.INFO}`}>
      {priority}
    </span>
  );
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function SectionHeader({ icon: Icon, title, count }: { icon: any; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="p-1.5 rounded-xl bg-theme-accent-bg border border-theme-accent-light">
        <Icon className="h-3 w-3 text-theme-accent" />
      </div>
      <h3 className="text-xs font-extrabold font-mono text-theme-text tracking-tight uppercase">
        {title}
      </h3>
      {count !== undefined && (
        <span className="text-[8px] font-mono font-bold bg-theme-card border border-theme-border text-theme-text-secondary px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  );
}

// ---- Main Component ------------------------------------------------------

interface ShiftBriefingModalProps {
  onClose: () => void;
}

export function ShiftBriefingModal({ onClose }: ShiftBriefingModalProps) {
  const { activePlantId } = usePlant();
  const [report, setReport] = useState<BriefingReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('actions');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/report/shift-briefing?plant_id=${activePlantId}`);
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      setReport(data);
      setExpandedSection('actions');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activePlantId]);

  // Auto-fetch on mount
  useState(() => { fetchReport(); });

  const toggleSection = (id: string) => {
    setExpandedSection(prev => prev === id ? null : id);
  };

  const handlePrint = () => {
    window.print();
  };

  const headlineColor = report
    ? report.headline.startsWith('⚠️') ? 'text-red-400 border-red-700/40 bg-red-950/30'
    : report.headline.startsWith('⚡') ? 'text-amber-400 border-amber-700/40 bg-amber-950/20'
    : 'text-emerald-400 border-emerald-700/30 bg-emerald-950/20'
    : '';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-theme-bg border border-theme-border rounded-3xl shadow-2xl overflow-hidden">
        
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border bg-theme-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-theme-accent-bg border border-theme-accent-light">
              <FileText className="h-5 w-5 text-theme-accent" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-theme-text tracking-tight">
                Shift Handover Safety Briefing
              </h2>
              <p className="text-[10px] text-theme-text-muted font-mono">
                {report ? report.plant_name : 'Loading...'} 
                {report && ` — Generated ${formatTime(report.generated_at)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="p-2 rounded-xl border border-theme-border bg-theme-card hover:bg-theme-card-hover text-theme-text-secondary transition-all"
              title="Refresh report"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl border border-theme-border bg-theme-card hover:bg-theme-card-hover text-theme-text-secondary transition-all"
              title="Print report"
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-red-700/40 bg-red-950/30 text-red-400 hover:bg-red-900/40 transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ---- Body ---- */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 scrollbar-thin">

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-theme-text-secondary">
              <RefreshCw className="h-8 w-8 animate-spin text-theme-accent" />
              <span className="text-xs font-mono">Generating shift briefing...</span>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-700/40 bg-red-950/30 p-4 text-red-400 text-xs font-mono">
              Failed to generate report: {error}
            </div>
          )}

          {report && !loading && (
            <>
              {/* Headline */}
              <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${headlineColor}`}>
                {report.headline}
              </div>

              {/* Summary metrics strip */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: Shield, label: 'Compliance', value: `${report.compliance_score.toFixed(0)}%`, 
                    color: report.compliance_score >= 90 ? 'text-emerald-400' : 'text-amber-400' },
                  { icon: Users, label: 'On Site', value: `${report.summary.workers_on_site}`, color: 'text-theme-text' },
                  { icon: FileWarning, label: 'Active Permits', value: `${report.summary.active_permits}`, color: 'text-theme-accent' },
                  { icon: BadgeAlert, label: 'PPE Open', value: `${report.summary.ppe_open}`,
                    color: report.summary.ppe_open > 0 ? 'text-red-400' : 'text-emerald-400' },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="bg-theme-card border border-theme-border rounded-2xl p-3 text-center">
                    <Icon className="h-4 w-4 mx-auto mb-1 text-theme-text-muted" />
                    <div className={`text-base font-black font-mono ${color}`}>{value}</div>
                    <div className="text-[8px] font-mono text-theme-text-muted uppercase">{label}</div>
                  </div>
                ))}
              </div>

              {/* Collapsible Sections */}
              {[
                {
                  id: 'actions',
                  icon: AlertTriangle,
                  title: 'Priority Action Items',
                  count: report.action_items.length,
                  content: (
                    <div className="space-y-2">
                      {report.action_items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <PriorityBadge priority={item.priority} />
                          <p className="text-[10px] text-theme-text-secondary leading-relaxed">{item.action}</p>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  id: 'zones',
                  icon: Shield,
                  title: 'Zone Risk Summary',
                  count: report.zone_risks.length,
                  content: (
                    <div className="space-y-2">
                      {report.zone_risks.map((z) => (
                        <div key={z.zone_id} className="flex items-start gap-3 bg-theme-card border border-theme-border rounded-2xl p-3">
                          <div className="shrink-0 pt-0.5"><RiskBadge level={z.risk_level} /></div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] font-bold text-theme-text">{z.zone_name}</span>
                              <span className="text-[9px] font-mono text-theme-text-muted">{z.risk_score}/100</span>
                            </div>
                            <p className="text-[9px] text-theme-text-secondary leading-relaxed line-clamp-2">
                              {z.explanation}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  id: 'forecasts',
                  icon: TrendingUp,
                  title: 'Gas Trend Forecasts (TTD)',
                  count: report.forecasts.filter(f => f.alert_level !== 'safe').length,
                  content: (
                    <div className="space-y-2">
                      {report.forecasts.map((f) => (
                        <div key={f.zone_id} className={`flex items-center justify-between bg-theme-card border rounded-2xl px-3 py-2.5 ${
                          f.alert_level === 'imminent' ? 'border-red-700/40' :
                          f.alert_level === 'warning'  ? 'border-amber-700/40' :
                          'border-theme-border'
                        }`}>
                          <div>
                            <div className="text-[10px] font-bold text-theme-text">{f.zone_name}</div>
                            <div className="text-[8px] font-mono text-theme-text-muted">
                              CO: {f.co_ppm_current.toFixed(1)} ppm ({f.trend_co}) · 
                              H₂S: {f.h2s_ppm_current.toFixed(2)} ppm ({f.trend_h2s})
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-xs font-black font-mono ${
                              f.alert_level === 'imminent' ? 'text-red-400 animate-pulse' :
                              f.alert_level === 'warning'  ? 'text-amber-400' : 'text-emerald-400'
                            }`}>
                              {f.overall_ttd_minutes !== null
                                ? `~${f.overall_ttd_minutes.toFixed(0)} min`
                                : '—'}
                            </div>
                            <div className="text-[8px] font-mono text-theme-text-muted uppercase">{f.alert_level}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  id: 'permits',
                  icon: FileWarning,
                  title: 'Active Work Permits',
                  count: report.active_permits.length,
                  content: report.active_permits.length === 0 ? (
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono">
                      <CheckCircle className="h-4 w-4" />
                      No active permits at evaluation time
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {report.active_permits.map((p) => (
                        <div key={p.permit_ref} className="bg-theme-card border border-theme-border rounded-2xl px-3 py-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono font-bold text-theme-accent">{p.permit_ref}</span>
                            <span className="text-[8px] font-mono font-bold bg-theme-accent-bg border border-theme-accent-light text-theme-accent px-1.5 py-0.5 rounded-full uppercase">
                              {p.permit_type.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[9px] text-theme-text-secondary">
                            {p.zone_name} · {p.issued_to}
                          </div>
                          <div className="text-[8px] text-theme-text-muted font-mono mt-0.5">
                            {formatTime(p.start_time)} → {formatTime(p.end_time)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  id: 'compliance',
                  icon: FileWarning,
                  title: 'Open Compliance Gaps',
                  count: report.compliance_gaps.length,
                  content: report.compliance_gaps.length === 0 ? (
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono">
                      <CheckCircle className="h-4 w-4" />
                      No active compliance deviations
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {report.compliance_gaps.map((d) => (
                        <div key={d.id} className="bg-theme-card border border-theme-border rounded-2xl p-3">
                          <div className="flex items-start gap-2 mb-1.5">
                            <SeverityBadge severity={d.severity} />
                            <span className="text-[9px] font-bold text-theme-text">{d.description}</span>
                          </div>
                          <p className="text-[8px] text-theme-text-secondary mb-1">
                            ↳ {d.corrective_action}
                          </p>
                          <span className="text-[8px] font-mono text-theme-text-muted">{d.citation}</span>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  id: 'ppe',
                  icon: BadgeAlert,
                  title: 'Open PPE Violations',
                  count: report.ppe_violations_open.length,
                  content: report.ppe_violations_open.length === 0 ? (
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono">
                      <CheckCircle className="h-4 w-4" />
                      No open PPE violations
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {report.ppe_violations_open.map((v) => (
                        <div key={v.id} className="flex items-center justify-between bg-theme-card border border-red-700/30 rounded-2xl px-3 py-2.5">
                          <div>
                            <div className="text-[10px] font-bold text-theme-text">{v.zone_name}</div>
                            <div className="text-[8px] font-mono text-red-400">
                              Missing: {v.ppe_items_missing.join(', ')}
                            </div>
                          </div>
                          <div className="text-[8px] font-mono text-theme-text-muted text-right">
                            {formatTime(v.timestamp)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ),
                },
              ].map(({ id, icon: Icon, title, count, content }) => (
                <div key={id} className="rounded-2xl border border-theme-border overflow-hidden">
                  <button
                    onClick={() => toggleSection(id)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-theme-card hover:bg-theme-card-hover transition-colors"
                  >
                    <SectionHeader icon={Icon} title={title} count={count} />
                    {expandedSection === id
                      ? <ChevronUp className="h-3.5 w-3.5 text-theme-text-muted shrink-0" />
                      : <ChevronDown className="h-3.5 w-3.5 text-theme-text-muted shrink-0" />
                    }
                  </button>
                  {expandedSection === id && (
                    <div className="px-4 pb-4 pt-2 border-t border-theme-border bg-theme-bg-alt animate-fadeIn">
                      {content}
                    </div>
                  )}
                </div>
              ))}

              {/* Footer */}
              <div className="flex items-center gap-1.5 text-[8px] font-mono text-theme-text-muted opacity-60 pb-2">
                <Info className="h-3 w-3 shrink-0" />
                Report generated at {formatTime(report.generated_at)} · Data evaluated at {formatTime(report.evaluation_time)} ·
                For regulatory compliance, refer to OISD 137, Factories Act 1948 Sec 36 &amp; 41-C.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
