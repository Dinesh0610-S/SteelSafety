import type { RiskStatus } from '../hooks/usePlantData';
import { usePlant } from '../context/PlantContext';

interface PlantHeatmapProps {
  currentRisks: Record<string, RiskStatus>;
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
}

export function PlantHeatmap({ currentRisks, selectedZoneId, onSelectZone }: PlantHeatmapProps) {
  const { activePlantId } = usePlant();
  const isCokeOven = activePlantId === 'plant_coke_oven';

  const getZoneStyles = (zoneId: string) => {
    const risk = currentRisks[zoneId];
    const isSelected = selectedZoneId === zoneId;
    
    const level = risk?.risk_level || 'low';
    
    let strokeColor = 'stroke-theme-risk-low';
    let fillColor = 'fill-theme-risk-low-bg';
    let hoverColor = 'hover:fill-theme-risk-low-bg/80';
    let pulseClass = '';

    if (level === 'medium') {
      strokeColor = 'stroke-theme-risk-med';
      fillColor = 'fill-theme-risk-med-bg';
      hoverColor = 'hover:fill-theme-risk-med-bg/80';
    } else if (level === 'high') {
      strokeColor = 'stroke-theme-risk-high';
      fillColor = 'fill-theme-risk-high-bg';
      hoverColor = 'hover:fill-theme-risk-high-bg/80';
      pulseClass = 'animate-pulse-orange';
    } else if (level === 'critical') {
      strokeColor = 'stroke-theme-risk-crit';
      fillColor = 'fill-theme-risk-crit-bg';
      hoverColor = 'hover:fill-theme-risk-crit-bg/80';
      pulseClass = 'animate-pulse-red';
    }

    const selectedStroke = isSelected ? 'stroke-theme-text stroke-[3px]' : 'stroke-2';

    return `${strokeColor} ${fillColor} ${hoverColor} ${pulseClass} ${selectedStroke} transition-all duration-300 cursor-pointer`;
  };

  const getStatusBadge = (zoneId: string) => {
    const risk = currentRisks[zoneId];
    const score = risk?.risk_score || 0;
    const level = risk?.risk_level || 'low';

    let color = 'bg-theme-risk-low-bg text-theme-risk-low-text border border-theme-risk-low-border';
    if (level === 'medium') color = 'bg-theme-risk-med-bg text-theme-risk-med-text border border-theme-risk-med-border';
    else if (level === 'high') color = 'bg-theme-risk-high-bg text-theme-risk-high-text border border-theme-risk-high-border';
    else if (level === 'critical') color = 'bg-theme-risk-crit-bg text-theme-risk-crit-text border border-theme-risk-crit-border animate-pulse';

    return (
      <div className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow ${color}`}>
        {level.toUpperCase()} ({score.toFixed(0)})
      </div>
    );
  };

  return (
    <div className="bg-theme-card border border-theme-border rounded-xl p-6 backdrop-blur-md relative overflow-hidden shadow-2xl animate-fadeIn">
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />
      
      <div className="flex justify-between items-center mb-6 relative z-10">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-theme-text flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-theme-risk-low animate-pulse" />
            {isCokeOven ? 'Coke Oven Battery Plant Heatmap' : 'Rolling Mill Complex Heatmap'}
          </h2>
          <p className="text-xs text-theme-text-secondary">Click any zone to drill down into operational metrics.</p>
        </div>
        <div className="flex items-center gap-3 bg-theme-bg-alt px-3 py-1.5 rounded-lg border border-theme-border">
          <span className="text-[10px] uppercase font-bold text-theme-text-muted">Legend:</span>
          <div className="flex gap-2 text-[10px]">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-theme-risk-low" /> Safe</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-theme-risk-med" /> Elevated</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-theme-risk-high" /> High</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-theme-risk-crit" /> Critical</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex justify-center items-center">
        {isCokeOven ? (
          <svg viewBox="0 0 740 450" className="w-full max-w-[700px] h-auto drop-shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <line x1="50" y1="365" x2="690" y2="365" className="stroke-theme-border stroke-[4px]" strokeDasharray="5,5" />
            <line x1="220" y1="220" x2="680" y2="220" className="stroke-theme-border stroke-[3px]" strokeDasharray="4,4" />

            {/* ZONE: Gas Collection Main (zone_gcm) */}
            <g onClick={() => onSelectZone('zone_gcm')}>
              <rect
                x="220" y="30" width="460" height="40" rx="6"
                className={getZoneStyles('zone_gcm')}
              />
              <line x1="230" y1="50" x2="670" y2="50" className="stroke-theme-border-muted stroke-2" />
              <text x="450" y="55" className="fill-theme-text text-xs font-bold text-center pointer-events-none" textAnchor="middle">
                Gas Collection Main
              </text>
            </g>

            {/* ZONE: Charging Area (zone_ca) */}
            <g onClick={() => onSelectZone('zone_ca')}>
              <rect
                x="220" y="90" width="460" height="40" rx="6"
                className={getZoneStyles('zone_ca')}
              />
              <circle cx="280" cy="110" r="5" className="stroke-theme-border-muted fill-none" />
              <circle cx="360" cy="110" r="5" className="stroke-theme-border-muted fill-none" />
              <circle cx="440" cy="110" r="5" className="stroke-theme-border-muted fill-none" />
              <circle cx="520" cy="110" r="5" className="stroke-theme-border-muted fill-none" />
              <circle cx="600" cy="110" r="5" className="stroke-theme-border-muted fill-none" />
              <text x="450" y="115" className="fill-theme-text text-xs font-bold text-center pointer-events-none" textAnchor="middle">
                Charging Platform Area
              </text>
            </g>

            {/* ZONE: Coke Oven Battery 1 (zone_cob1) */}
            <g onClick={() => onSelectZone('zone_cob1')}>
              <rect
                x="220" y="150" width="460" height="140" rx="8"
                className={getZoneStyles('zone_cob1')}
              />
              <g className="stroke-theme-border-muted stroke-1 pointer-events-none">
                {Array.from({ length: 15 }).map((_, i) => (
                  <line key={i} x1={240 + i * 28} y1="155" x2={240 + i * 28} y2="285" />
                ))}
              </g>
              <text x="450" y="225" className="fill-theme-text text-sm font-bold text-center pointer-events-none" textAnchor="middle">
                Coke Oven Battery 1
              </text>
            </g>

            {/* ZONE: Control Room (zone_cr) */}
            <g onClick={() => onSelectZone('zone_cr')}>
              <rect
                x="50" y="320" width="150" height="90" rx="8"
                className={getZoneStyles('zone_cr')}
              />
              <rect x="65" y="335" width="40" height="15" rx="2" className="stroke-theme-border-muted fill-none" />
              <rect x="145" y="335" width="40" height="15" rx="2" className="stroke-theme-border-muted fill-none" />
              <text x="125" y="375" className="fill-theme-text text-xs font-bold text-center pointer-events-none" textAnchor="middle">
                Control Room Office
              </text>
            </g>

            {/* ZONE: Quenching Tower (zone_qt) */}
            <g onClick={() => onSelectZone('zone_qt')}>
              <rect
                x="530" y="320" width="150" height="90" rx="8"
                className={getZoneStyles('zone_qt')}
              />
              <line x1="560" y1="335" x2="570" y2="345" className="stroke-theme-border-muted stroke-2" />
              <line x1="600" y1="335" x2="610" y2="345" className="stroke-theme-border-muted stroke-2" />
              <text x="605" y="375" className="fill-theme-text text-xs font-bold text-center pointer-events-none" textAnchor="middle">
                Quenching Tower
              </text>
            </g>
          </svg>
        ) : (
          <svg viewBox="0 0 740 450" className="w-full max-w-[700px] h-auto drop-shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            {/* Rolling Mill Line */}
            <line x1="50" y1="170" x2="690" y2="170" className="stroke-theme-border stroke-[5px]" />
            <line x1="50" y1="345" x2="690" y2="345" className="stroke-theme-border stroke-[2px]" strokeDasharray="4,4" />

            {/* ZONE: Reheating Furnace (zone_rhf) */}
            <g onClick={() => onSelectZone('zone_rhf')}>
              <rect
                x="50" y="50" width="150" height="240" rx="8"
                className={getZoneStyles('zone_rhf')}
              />
              <path d="M 70 80 Q 90 60 110 80 T 150 80" className="stroke-theme-border-muted fill-none stroke-2" />
              <text x="125" y="175" className="fill-theme-text text-xs font-bold text-center pointer-events-none" textAnchor="middle">
                Reheating Furnace
              </text>
            </g>

            {/* ZONE: Rolling Stand (zone_rs) */}
            <g onClick={() => onSelectZone('zone_rs')}>
              <rect
                x="240" y="100" width="120" height="140" rx="8"
                className={getZoneStyles('zone_rs')}
              />
              <circle cx="300" cy="140" r="15" className="stroke-theme-border-muted fill-none stroke-2" />
              <circle cx="300" cy="200" r="15" className="stroke-theme-border-muted fill-none stroke-2" />
              <text x="300" y="185" className="fill-theme-text text-xs font-bold text-center pointer-events-none" textAnchor="middle">
                Rolling Stand
              </text>
            </g>

            {/* ZONE: Cooling Bed (zone_cb) */}
            <g onClick={() => onSelectZone('zone_cb')}>
              <rect
                x="400" y="50" width="140" height="240" rx="8"
                className={getZoneStyles('zone_cb')}
              />
              <g className="stroke-theme-border-muted stroke-[1.5px] pointer-events-none">
                {Array.from({ length: 8 }).map((_, i) => (
                  <line key={i} x1={415 + i * 15} y1="60" x2={415 + i * 15} y2="280" />
                ))}
              </g>
              <text x="470" y="175" className="fill-theme-text text-xs font-bold text-center pointer-events-none" textAnchor="middle">
                Cooling Bed
              </text>
            </g>

            {/* ZONE: Finishing Line (zone_fl) */}
            <g onClick={() => onSelectZone('zone_fl')}>
              <rect
                x="580" y="100" width="110" height="140" rx="8"
                className={getZoneStyles('zone_fl')}
              />
              <line x1="600" y1="120" x2="670" y2="220" className="stroke-theme-border-muted stroke-2" />
              <text x="635" y="185" className="fill-theme-text text-xs font-bold text-center pointer-events-none" textAnchor="middle">
                Finishing Line
              </text>
            </g>

            {/* ZONE: Mill Control Room (zone_cr2) */}
            <g onClick={() => onSelectZone('zone_cr2')}>
              <rect
                x="240" y="300" width="280" height="90" rx="8"
                className={getZoneStyles('zone_cr2')}
              />
              <rect x="260" y="320" width="30" height="12" rx="1" className="stroke-theme-border-muted fill-none" />
              <rect x="470" y="320" width="30" height="12" rx="1" className="stroke-theme-border-muted fill-none" />
              <text x="380" y="355" className="fill-theme-text text-xs font-bold text-center pointer-events-none" textAnchor="middle">
                Mill Control Room
              </text>
            </g>
          </svg>
        )}

        {/* Dynamic Badge Overlays */}
        {isCokeOven ? (
          <>
            <div className="absolute pointer-events-none top-[55px] left-[78%]">{getStatusBadge('zone_gcm')}</div>
            <div className="absolute pointer-events-none top-[115px] left-[78%]">{getStatusBadge('zone_ca')}</div>
            <div className="absolute pointer-events-none top-[225px] left-[78%]">{getStatusBadge('zone_cob1')}</div>
            <div className="absolute pointer-events-none top-[375px] left-[32%]">{getStatusBadge('zone_cr')}</div>
            <div className="absolute pointer-events-none top-[375px] left-[84%]">{getStatusBadge('zone_qt')}</div>
          </>
        ) : (
          <>
            <div className="absolute pointer-events-none top-[175px] left-[15%]">{getStatusBadge('zone_rhf')}</div>
            <div className="absolute pointer-events-none top-[175px] left-[42%]">{getStatusBadge('zone_rs')}</div>
            <div className="absolute pointer-events-none top-[175px] left-[63%]">{getStatusBadge('zone_cb')}</div>
            <div className="absolute pointer-events-none top-[175px] left-[88%]">{getStatusBadge('zone_fl')}</div>
            <div className="absolute pointer-events-none top-[350px] left-[49%]">{getStatusBadge('zone_cr2')}</div>
          </>
        )}
      </div>
    </div>
  );
}
