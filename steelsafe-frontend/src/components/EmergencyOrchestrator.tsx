import { AlertTriangle, ShieldAlert, Users, Volume2, FileText } from 'lucide-react';

interface ActiveAlert {
  zoneId: string;
  zoneName: string;
  score: number;
  triggeredRules: string | null;
  explanation: string;
}

interface EmergencyOrchestratorProps {
  activeAlerts: ActiveAlert[];
  virtualTime: Date | null;
}

const ADJACENT_ZONES: Record<string, string[]> = {
  'zone_cob1': ['zone_gcm', 'zone_ca'],
  'zone_gcm': ['zone_cob1', 'zone_qt'],
  'zone_ca': ['zone_cob1', 'zone_cr'],
  'zone_qt': ['zone_gcm'],
  'zone_cr': ['zone_ca'],
};

const ZONE_DISPLAY_NAMES: Record<string, string> = {
  'zone_cob1': 'Coke Oven Battery 1',
  'zone_gcm': 'Gas Collection Main',
  'zone_ca': 'Charging Platform',
  'zone_qt': 'Quenching Tower',
  'zone_cr': 'Control Room',
};

export function EmergencyOrchestrator({ activeAlerts, virtualTime }: EmergencyOrchestratorProps) {
  if (activeAlerts.length === 0) return null;

  const primaryAlert = [...activeAlerts].sort((a, b) => b.score - a.score)[0];
  const { zoneId, zoneName, score, triggeredRules, explanation } = primaryAlert;

  const adjacentIds = ADJACENT_ZONES[zoneId] || [];
  const adjacentNames = adjacentIds.map(id => ZONE_DISPLAY_NAMES[id] || id);

  const formattedTime = virtualTime
    ? virtualTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : 'N/A';

  const reportRef = `INC-2026-${(virtualTime?.getTime() || Date.now()).toString().slice(-4)}`;

  const getSimulatedTelemetry = () => {
    if (zoneId === 'zone_gcm') {
      return { co: "170.8 ppm (Critical)", h2s: "4.82 ppm (Elevated)", pressure: "97.4 kPa (Low)", workers: 3, permits: 1 };
    } else if (zoneId === 'zone_cob1') {
      return { co: "35.2 ppm (Normal)", h2s: "14.22 ppm (Critical)", pressure: "101.2 kPa (Normal)", workers: 5, permits: 1 };
    } else if (zoneId === 'zone_ca') {
      return { co: "120.4 ppm (High)", h2s: "1.22 ppm (Normal)", pressure: "100.3 kPa (Normal)", workers: 6, permits: 1 };
    }
    return { co: "Normal", h2s: "Normal", pressure: "Normal", workers: 0, permits: 0 };
  };

  const tele = getSimulatedTelemetry();

  const getRegulatoryParagraph = () => {
    if (zoneId === 'zone_gcm') {
      return "VIOLATION PROFILE:\n- OISD Standard 137 Section 1: Hot work permit remains active during rising gas trend exceeding 35 ppm.\n- Gas Safety SOP Section C: GCM catwalk operations continued despite pressure drop of >= 2.5 kPa.\n- Indian Factories Act Section 87: Mass exposure risk due to worker clustering (3 personnel present in GCM catwalk).";
    } else if (zoneId === 'zone_cob1') {
      return "VIOLATION PROFILE:\n- OISD Standard 137 Section 2: Confined space entry active with H2S above action level (>5 ppm).\n- Indian Factories Act Section 36: Personnel entered battery flues without secondary standby line supervision.\n- OISD Standard 137 Section 3: Active permit during shift boundary changeover without formal supervisor handover.";
    } else if (zoneId === 'zone_ca') {
      return "VIOLATION PROFILE:\n- Indian Factories Act Section 87: Extreme clustered risk (6 workers) present in Charging Area.\n- OISD Standard 137 Section 1: Spark risk active under expired cold-work permit with elevated CO.\n- Gas Safety SOP Section A: CO levels exceeded TWA limits (85 ppm).";
    }
    return "VIOLATION PROFILE:\n- General exposure risk exceeding baseline mean+std thresholds. Evacuation protocols mandated.";
  };

  return (
    <div className="bg-theme-risk-crit-bg/40 border border-theme-risk-crit-border rounded-3xl p-6 shadow-sm animate-fadeIn mt-4">
      {/* Flashing Banner */}
      <div className="bg-theme-risk-crit border border-theme-risk-crit-border rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-theme-text-inverse shadow-md animate-pulse mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-theme-risk-crit-text/25 border border-theme-risk-crit-border">
            <ShieldAlert className="h-6 w-6 text-theme-text-inverse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] bg-theme-risk-crit-text/30 font-mono px-2 py-0.5 rounded-full font-bold border border-theme-risk-crit-border tracking-wider text-theme-text-inverse">
                CRITICAL ALERT
              </span>
              <span className="text-[10px] font-mono font-bold text-theme-text-inverse/85">{formattedTime}</span>
            </div>
            <h3 className="text-xs font-bold tracking-wide mt-1">
              🚨 EVACUATION SIRENS TRIGGERED: {zoneName.toUpperCase()} (Score: {score.toFixed(0)}/100)
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-theme-risk-crit-text/20 border border-theme-risk-crit-border px-3 py-1.5 rounded-xl text-[10px] font-bold font-mono text-theme-text-inverse">
          <Volume2 className="h-4 w-4 animate-bounce" />
          SIRENS ACTIVE
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Evacuation Map */}
        <div className="bg-theme-card border border-theme-border rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b border-theme-border-muted pb-2">
            <AlertTriangle className="h-4.5 w-4.5 text-theme-risk-crit" />
            <h4 className="text-xs font-bold text-theme-text uppercase tracking-tight">Zone Evacuation Router</h4>
          </div>
          
          <div className="space-y-3 text-xs">
            <div>
              <span className="text-theme-text-muted block text-[9px] font-bold uppercase">Primary Hazard Zone</span>
              <span className="text-sm font-extrabold text-theme-risk-crit flex items-center gap-1.5 mt-0.5">
                ❌ Evacuate: {zoneName}
              </span>
            </div>

            <div>
              <span className="text-theme-text-muted block text-[9px] font-bold uppercase">Immediate Evacuation Ring</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {adjacentNames.map((name, i) => (
                  <span key={i} className="px-2 py-0.5 bg-theme-risk-high-bg border border-theme-risk-high-border text-theme-risk-high-text rounded-full font-bold text-[9px]">
                    ⚠️ {name}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span className="text-theme-text-muted block text-[9px] font-bold uppercase">Active Personnel Status</span>
              <span className="flex items-center gap-1.5 font-bold text-theme-text-secondary mt-1">
                <Users className="h-4 w-4 text-theme-text-muted" />
                {tele.workers} workers in hazard zone, {adjacentIds.length * 2} adjacent
              </span>
            </div>
          </div>
        </div>

        {/* Middle Column: Evacuation Plan & Action Checklist */}
        <div className="bg-theme-card border border-theme-border rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b border-theme-border-muted pb-2">
            <ShieldAlert className="h-4.5 w-4.5 text-theme-risk-crit" />
            <h4 className="text-xs font-bold text-theme-text uppercase tracking-tight">Standard Operating Procedures</h4>
          </div>

          <ul className="space-y-2 text-xs font-semibold text-theme-text-secondary">
            <li className="flex gap-2 items-start">
              <span className="text-theme-risk-crit">1.</span>
              <span>Evacuate all non-essential personnel to Vizag Office complex assembly point.</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-theme-risk-crit">2.</span>
              <span>Deploy pressurized standby rescue team with SCBA breathing gear.</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-theme-risk-crit">3.</span>
              <span>Purge Gas Collection mains and seal furnace draft doors immediately.</span>
            </li>
          </ul>
        </div>

        {/* Right Column: Grounded Report Preview */}
        <div className="bg-theme-card border border-theme-border rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b border-theme-border-muted pb-2">
            <FileText className="h-4.5 w-4.5 text-theme-text-muted" />
            <h4 className="text-xs font-bold text-theme-text uppercase tracking-tight">Audit Report Draft ({reportRef})</h4>
          </div>

          <div className="flex-1 bg-theme-bg-alt border border-theme-border p-3 rounded-xl font-mono text-[9px] text-theme-text-muted overflow-y-auto leading-relaxed h-[120px]">
            <div>===================================</div>
            <div className="font-bold text-theme-risk-crit">STEELSAFE EMERGENCY REPORT PREVIEW</div>
            <div>===================================</div>
            <div>Timestamp: {formattedTime}</div>
            <div>Trigger Zone: {zoneName}</div>
            <div>Fired Rules: {triggeredRules}</div>
            <div>Ambient Gases:</div>
            <div>- CO: {tele.co}</div>
            <div>- H2S: {tele.h2s}</div>
            <div>- Pressure: {tele.pressure}</div>
            <div>-----------------------------------</div>
            <div className="whitespace-pre-line text-theme-text-secondary">{getRegulatoryParagraph()}</div>
            <div>-----------------------------------</div>
            <div>Explanation: {explanation}</div>
            <div>===================================</div>
          </div>
        </div>
      </div>
    </div>
  );
}
