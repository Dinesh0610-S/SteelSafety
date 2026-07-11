import { useState, useEffect } from 'react';
import { usePlant } from '../context/PlantContext';
import { 
  ShieldAlert, 
  CheckCircle, 
  AlertTriangle, 
  Wrench, 
  FileText, 
  Check, 
  UserCheck
} from 'lucide-react';

interface Deviation {
  id: number;
  zone_id: string | null;
  timestamp: string;
  category: string;
  deviation_type: string;
  description: string;
  regulatory_requirement: string;
  citation: string;
  severity: string;
  corrective_action: string;
  resolved: boolean;
}

export function CompliancePanel() {
  const { activePlantId } = usePlant();
  const [deviations, setDeviations] = useState<Deviation[]>([]);
  const [zoneLabels, setZoneLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch dynamic zone names for labeling
  useEffect(() => {
    if (!activePlantId) return;
    fetch(`/api/v1/zones?plant_id=${activePlantId}`)
      .then((r) => r.json())
      .then((data: any[]) => {
        const mapping: Record<string, string> = {};
        data.forEach((z) => {
          mapping[z.zone_id] = z.name;
        });
        setZoneLabels(mapping);
      })
      .catch((e) => console.warn("Failed to fetch zone names for compliance labels:", e));
  }, [activePlantId]);

  const fetchDeviations = async () => {
    try {
      const response = await fetch(`/api/v1/risk/compliance/deviations?plant_id=${activePlantId}`);
      if (!response.ok) {
        throw new Error('Failed to retrieve compliance records.');
      }
      const data = await response.json();
      setDeviations(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error connecting to compliance server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeviations();
    const interval = setInterval(fetchDeviations, 3000);
    return () => clearInterval(interval);
  }, [activePlantId]);

  const handleResolve = async (id: number) => {
    try {
      const response = await fetch(`/api/v1/risk/compliance/deviations/${id}/resolve`, {
        method: 'POST',
      });
      if (response.ok) {
        fetchDeviations();
      }
    } catch (err) {
      console.error('Error resolving deviation:', err);
    }
  };

  const activeDevs = deviations.filter(d => !d.resolved);
  const resolvedDevs = deviations.filter(d => d.resolved);

  // Compute compliance score
  const highCount = activeDevs.filter(d => d.severity === 'high').length;
  const medCount = activeDevs.filter(d => d.severity === 'medium').length;
  const complianceScore = Math.max(0, 100 - (highCount * 15 + medCount * 5));

  const getScoreColorClass = (score: number) => {
    if (score >= 90) return 'text-theme-risk-low-text border-theme-risk-low-border bg-theme-risk-low-bg/60 shadow-sm';
    if (score >= 70) return 'text-theme-risk-med-text border-theme-risk-med-border bg-theme-risk-med-bg/60 shadow-sm';
    return 'text-theme-risk-crit-text border-theme-risk-crit-border bg-theme-risk-crit-bg/60 shadow-sm';
  };

  if (loading && deviations.length === 0) {
    return (
      <div className="bg-theme-card border border-theme-border rounded-3xl p-12 text-center text-theme-text-muted font-mono text-xs shadow-sm backdrop-blur-md">
        Loading Compliance Audit data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Audit Header & Summary Scoreboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Compliance Rating Meter */}
        <div className={`border rounded-2xl p-5 flex flex-col justify-between backdrop-blur-md transition-all ${getScoreColorClass(complianceScore)}`}>
          <div>
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase opacity-80">Site Safety Rating</span>
            <h4 className="text-3xl font-black font-mono tracking-tight mt-1">{complianceScore}%</h4>
          </div>
          <p className="text-[10px] font-semibold mt-3 opacity-90 leading-relaxed">
            {complianceScore === 100 
              ? '✓ All statutory requirements currently aligned. Safe operational compliance.' 
              : `⚠️ ${activeDevs.length} unresolved safety/audit deviations found. Gaps require remediation.`}
          </p>
        </div>

        {/* Total Gaps Found */}
        <div className="bg-theme-card border border-theme-border rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-mono font-bold text-theme-text-muted tracking-wider uppercase">Unresolved Gaps</span>
            <div className="flex items-baseline gap-2 mt-1">
              <h4 className="text-3xl font-black font-mono text-theme-risk-crit-text">{activeDevs.length}</h4>
              <span className="text-[10px] font-semibold text-theme-text-muted font-mono">active items</span>
            </div>
          </div>
          <div className="flex gap-2 text-[9px] font-mono font-bold text-theme-text-secondary mt-3 border-t border-theme-border pt-2.5">
            <span className="text-theme-risk-crit-text font-bold">{highCount} High</span>
            <span>|</span>
            <span className="text-theme-risk-med-text font-bold">{medCount} Medium</span>
          </div>
        </div>

        {/* Resolved Actions */}
        <div className="bg-theme-card border border-theme-border rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-mono font-bold text-theme-text-muted tracking-wider uppercase">Audit Resolutions</span>
            <div className="flex items-baseline gap-2 mt-1">
              <h4 className="text-3xl font-black font-mono text-theme-risk-low">{resolvedDevs.length}</h4>
              <span className="text-[10px] font-semibold text-theme-text-muted font-mono">resolved items</span>
            </div>
          </div>
          <p className="text-[10px] font-semibold text-theme-text-secondary mt-3 border-t border-theme-border pt-2.5">
            Track record of on-site compliance corrections.
          </p>
        </div>

        {/* Statutory Coverage */}
        <div className="bg-theme-card border border-theme-border rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-mono font-bold text-theme-text-muted tracking-wider uppercase">Audited Frameworks</span>
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="px-2 py-0.5 rounded-full bg-theme-bg border border-theme-border text-[9px] font-mono text-theme-accent font-bold">OISD 137</span>
              <span className="px-2 py-0.5 rounded-full bg-theme-bg border border-theme-border text-[9px] font-mono text-theme-sky-text font-bold">Factories Act</span>
              <span className="px-2 py-0.5 rounded-full bg-theme-bg border border-theme-border text-[9px] font-mono text-theme-risk-low-text font-bold">DGMS Codes</span>
            </div>
          </div>
          <p className="text-[10px] font-semibold text-theme-text-secondary border-t border-theme-border pt-2.5">
            Continuous statutory cross-referencing active.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-theme-risk-crit-bg border border-theme-risk-crit-border rounded-2xl text-[10px] font-mono font-bold text-theme-risk-crit-text flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Error: {error}</span>
        </div>
      )}

      {/* Main Dev List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Unresolved Safety Gaps */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-xs font-bold text-theme-text tracking-wider uppercase flex items-center gap-1.5">
            <ShieldAlert className="h-4.5 w-4.5 text-theme-risk-crit" />
            Active Regulatory Deviations & Gaps ({activeDevs.length})
          </h3>

          {activeDevs.length === 0 ? (
            <div className="bg-theme-card border border-dashed border-theme-border rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-2 text-theme-text-muted">
              <CheckCircle className="h-10 w-10 text-theme-risk-low/50" />
              <span className="text-xs font-semibold">No active compliance deviations found. All systems conform to regulatory codes.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {activeDevs.map(dev => (
                <div 
                  key={dev.id} 
                  className={`bg-theme-card border rounded-2xl p-5 shadow-sm relative overflow-hidden transition-all hover:translate-y-[-1px] ${
                    dev.severity === 'high' 
                      ? 'border-theme-risk-crit-border hover:border-theme-risk-crit-text' 
                      : 'border-theme-risk-med-border hover:border-theme-risk-med-text'
                  }`}
                >
                  {/* Category & Severity tags */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-theme-bg border border-theme-border text-[8px] font-mono text-theme-text-muted font-bold uppercase tracking-wider">
                        {dev.category}
                      </span>
                      <span className="text-[10px] text-theme-text-muted font-mono">•</span>
                      <span className="text-[10px] text-theme-text-secondary font-bold font-mono">
                        {dev.zone_id ? zoneLabels[dev.zone_id] || dev.zone_id : 'Site-wide'}
                      </span>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-mono font-black uppercase tracking-wider ${
                      dev.severity === 'high' 
                        ? 'bg-theme-risk-crit-bg text-theme-risk-crit-text border border-theme-risk-crit-border' 
                        : 'bg-theme-risk-med-bg text-theme-risk-med-text border border-theme-risk-med-border'
                    }`}>
                      {dev.severity} priority
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h4 className="text-xs font-bold text-theme-text mb-1.5 font-mono">{dev.deviation_type}</h4>
                  <p className="text-[11px] text-theme-text-secondary leading-relaxed font-medium mb-3">{dev.description}</p>

                  {/* Grounded Citation details from RAG */}
                  <div className="bg-theme-bg-alt border border-theme-border rounded-2xl p-3.5 mb-4 space-y-1.5 shadow-sm">
                    <div className="flex items-center gap-1.5 text-[9px] font-mono text-theme-accent font-bold">
                      <FileText className="h-3.5 w-3.5" />
                      <span>Regulatory Source: {dev.citation}</span>
                    </div>
                    <p className="text-[10px] text-theme-text-secondary italic font-serif leading-relaxed border-l-2 border-theme-accent pl-2">
                      "{dev.regulatory_requirement}"
                    </p>
                  </div>

                  {/* Corrective Action Plan & Resolve button */}
                  <div className="flex items-end justify-between gap-4 bg-theme-bg-alt/50 border border-theme-border p-3.5 rounded-2xl">
                    <div className="space-y-1">
                       <span className="text-[9px] font-mono font-bold text-theme-risk-low-text uppercase tracking-wider flex items-center gap-1">
                        <Wrench className="h-3.5 w-3.5" />
                        Automated Action Plan
                       </span>
                      <p className="text-[10px] font-mono text-theme-text-secondary leading-relaxed max-w-[450px]">
                        {dev.corrective_action}
                      </p>
                    </div>

                    <button
                      onClick={() => handleResolve(dev.id)}
                      className="px-4 py-2 bg-theme-risk-low hover:bg-theme-risk-low/80 text-white font-mono text-[10px] font-bold rounded-xl flex items-center gap-1 shadow-md transition-all active:scale-[0.98]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Resolve Gaps
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Col: Resolved History Log */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-theme-text tracking-wider uppercase flex items-center gap-1.5">
            <CheckCircle className="h-4.5 w-4.5 text-theme-risk-low" />
            Resolution Log ({resolvedDevs.length})
          </h3>

          {resolvedDevs.length === 0 ? (
            <div className="bg-theme-card border border-theme-border rounded-2xl p-6 text-center text-[10px] font-mono text-theme-text-muted shadow-sm">
              No audit items resolved during this shift.
            </div>
          ) : (
            <div className="space-y-3">
              {resolvedDevs.map(dev => (
                <div key={dev.id} className="bg-theme-card border border-theme-border p-4 rounded-2xl space-y-2 relative opacity-70 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full bg-theme-bg border border-theme-border text-[7px] font-mono text-theme-text-muted font-bold uppercase">
                      {dev.category}
                    </span>
                    <span className="text-[9px] font-mono text-theme-risk-low-text font-bold flex items-center gap-0.5">
                      <UserCheck className="h-3.5 w-3.5" />
                      Resolved
                    </span>
                  </div>

                  <h4 className="text-[10px] font-bold text-theme-text-muted font-mono line-through">{dev.deviation_type}</h4>
                  <p className="text-[9px] text-theme-text-muted leading-normal line-through">{dev.description}</p>
                  
                  <div className="text-[8px] font-mono text-theme-text-muted pt-2 border-t border-theme-border flex justify-between">
                    <span>Source: {dev.citation}</span>
                    <span>ID: #{dev.id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
