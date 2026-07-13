import { useState, useEffect, useMemo, useRef } from 'react';
import { usePlant } from '../context/PlantContext';
import type { RiskStatus } from '../hooks/usePlantData';
import type { PPEViolationEvent } from './CCTVPanel';
import {
  Layers, MapPin, Camera, AlertTriangle, Radio, Eye, UserX
} from 'lucide-react';

interface FactoryMapViewProps {
  currentRisks: Record<string, RiskStatus>;
  violations: PPEViolationEvent[];
  onSelectCamera: (id: string) => void;
  onSelectZone: (id: string) => void;
}

interface SpatialZone {
  zone_id: string;
  name: string;
  x: number;
  y: number;
  boundary: [number, number][];
}

const ZONE_NAME_MAP: Record<string, string> = {
  // Coke Oven Battery (plant_a)
  "zone_cob1": "Coke Oven Battery 1",
  "zone_gcm": "Gas Collection Main",
  "zone_qt": "Quenching Tower",
  "zone_ca": "Charging Area",
  "zone_cr": "Control Room",
  // Rolling Mill Complex (plant_b)
  "zone_rhf": "Reheating Furnace",
  "zone_rs": "Rolling Stand",
  "zone_cb": "Cooling Bed",
  "zone_fl": "Finishing Line",
  "zone_cr2": "Mill Control Room",
};

export function FactoryMapView({ currentRisks, violations, onSelectCamera, onSelectZone }: FactoryMapViewProps) {
  const { activePlantId } = usePlant();
  const isCokeOven = activePlantId === 'plant_coke_oven';

  const [viewMode, setViewMode] = useState<'heatmap' | 'camera' | 'sensor' | 'alert' | 'zone'>('heatmap');
  const [spatialLayout, setSpatialLayout] = useState<SpatialZone[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch spatial layout coordinates from backend
  useEffect(() => {
    const fetchLayout = async () => {
      try {
        const res = await fetch(`/api/v1/zones/spatial/layout?plant_id=${activePlantId}`);
        if (res.ok) {
          setSpatialLayout(await res.json());
        }
      } catch (err) {
        console.warn("Failed to fetch spatial layout:", err);
      }
    };
    fetchLayout();
  }, [activePlantId]);

  // Color mapping helper for score
  const getColorForScore = (score: number, alpha: number) => {
    let r = 16, g = 185, b = 129; // Green
    if (score < 40) {
      // Interpolate Green (16, 185, 129) -> Yellow (245, 158, 11)
      const ratio = score / 40;
      r = Math.round(16 + (245 - 16) * ratio);
      g = Math.round(185 + (158 - 185) * ratio);
      b = Math.round(129 + (11 - 129) * ratio);
    } else if (score < 75) {
      // Interpolate Yellow (245, 158, 11) -> Orange (249, 115, 22)
      const ratio = (score - 40) / 35;
      r = Math.round(245 + (249 - 245) * ratio);
      g = Math.round(158 + (115 - 158) * ratio);
      b = Math.round(11 + (22 - 11) * ratio);
    } else {
      // Interpolate Orange (249, 115, 22) -> Red (239, 68, 68)
      const ratio = Math.min(1, (score - 75) / 25);
      r = Math.round(249 + (239 - 249) * ratio);
      g = Math.round(115 + (68 - 115) * ratio);
      b = Math.round(22 + (68 - 22) * ratio);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Render smooth canvas-based IDW gradient overlay
  useEffect(() => {
    if (!canvasRef.current || spatialLayout.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // If not in Heatmap or Alert view, do not draw gradient colors
    if (viewMode !== 'heatmap' && viewMode !== 'alert') return;

    const step = 6;
    const p = 2; // IDW distance power index

    // Map spatial zones to active risks
    const zonesWithRisk = spatialLayout.map(z => {
      const riskObj = currentRisks[z.zone_id];
      let score = riskObj ? riskObj.risk_score : 10;
      
      // If Alert Mode, boost score dynamically to show alert hotspots
      if (viewMode === 'alert') {
        const hasAlert = violations.some(v => v.zone_id === z.zone_id && v.status === 'open');
        score = hasAlert ? 95 : 10;
      }
      
      return {
        x: z.x,
        y: z.y,
        score
      };
    });

    for (let x = 0; x < width; x += step) {
      for (let y = 0; y < height; y += step) {
        let numerator = 0;
        let denominator = 0;
        let exactMatch = null;

        for (let i = 0; i < zonesWithRisk.length; i++) {
          const zone = zonesWithRisk[i];
          const dx = x - zone.x;
          const dy = y - zone.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < 16) {
            exactMatch = zone.score;
            break;
          }

          const weight = 1 / Math.pow(distSq, p / 2);
          numerator += weight * zone.score;
          denominator += weight;
        }

        const score = exactMatch !== null ? exactMatch : (numerator / denominator);

        // Find distance to closest zone center to apply smooth border fade out
        let closestDist = Infinity;
        zonesWithRisk.forEach(z => {
          const d = Math.hypot(x - z.x, y - z.y);
          if (d < closestDist) closestDist = d;
        });

        const maxInfluence = 220;
        const opacityMultiplier = Math.max(0, 1 - closestDist / maxInfluence);

        if (opacityMultiplier > 0) {
          const alpha = opacityMultiplier * 0.35; // Cap maximum overlay opacity at 35%
          ctx.fillStyle = getColorForScore(score, alpha);
          ctx.fillRect(x, y, step, step);
        }
      }
    }
  }, [spatialLayout, currentRisks, viewMode, violations]);

  // Active alerts list per zone
  const activeAlertsList = useMemo(() => {
    const list: Record<string, number> = {};
    violations.forEach(v => {
      if (v.status === 'open') {
        list[v.zone_id] = (list[v.zone_id] || 0) + 1;
      }
    });
    return Object.entries(list).map(([zoneId, count]) => ({
      zoneId,
      name: ZONE_NAME_MAP[zoneId] || zoneId,
      count
    }));
  }, [violations]);

  // Bottom stats calculations
  const stats = useMemo(() => {
    const totalCameras = isCokeOven ? 5 : 5;
    const activeAlerts = violations.filter(v => v.status === 'open').length;

    const scores = Object.values(currentRisks).map(r => r.risk_score);
    const avgRisk = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const safetyScore = Math.round(100 - avgRisk);

    const zones = Object.values(currentRisks);
    const safeZones = zones.filter(z => z.risk_level === 'low').length;
    const safeZonesPct = zones.length > 0 ? Math.round((safeZones / zones.length) * 100) : 100;

    return {
      totalCameras,
      activeAlerts,
      safetyScore,
      safeZonesPct
    };
  }, [currentRisks, violations, isCokeOven]);

  return (
    <div id="factory-map-view" className="flex flex-col gap-6 w-full text-slate-100">
      
      {/* Header view mode info */}
      <div className="flex flex-col leading-tight">
        <h2 className="text-xl font-black tracking-tight text-white m-0">12. FACTORY ANALYTICS / MAP</h2>
        <p className="text-[11px] text-slate-400 font-bold mt-1.5">Architectural gradient floor plan heatmap</p>
      </div>

      {/* Main Grid: View toggles + Canvas Map + Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-stretch">
        
        {/* Left Side: View Mode Toggles */}
        <div className="xl:col-span-1 bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-sm justify-between">
          <div className="flex flex-col gap-4">
            <h3 className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest pb-2 border-b border-theme-border">Layers</h3>
            
            <div className="flex flex-col gap-1.5">
              {[
                { mode: 'heatmap', label: 'Heatmap View', icon: Layers },
                { mode: 'camera', label: 'Camera View', icon: Camera },
                { mode: 'sensor', label: 'Sensor View', icon: Radio },
                { mode: 'alert', label: 'Alert View', icon: AlertTriangle },
                { mode: 'zone', label: 'Zone Management', icon: MapPin }
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.mode}
                    onClick={() => setViewMode(item.mode as any)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 ${
                      viewMode === item.mode
                        ? 'bg-[#10b981]/10 text-emerald-400 border border-[#10b981]/20 shadow-sm'
                        : 'text-theme-text-secondary hover:bg-theme-card-hover hover:text-theme-text border border-transparent'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 bg-theme-well border border-theme-border rounded-2xl flex items-start gap-2 text-[9.5px] text-theme-text-muted font-semibold leading-relaxed">
            <Eye className="h-4.5 w-4.5 text-theme-text-secondary shrink-0 mt-0.5" />
            <span>Computes live Inverse Distance Weighting (IDW) color gradients continuously.</span>
          </div>
        </div>

        {/* Middle Area: Map Canvas */}
        <div className="xl:col-span-2 bg-theme-card border border-theme-border rounded-3xl p-6 flex flex-col items-center justify-center shadow-md relative min-h-[450px]">
          
          {/* 1. HTML5 Heatmap Gradient Canvas */}
          <canvas
            ref={canvasRef}
            width={740}
            height={450}
            className="absolute top-6 bottom-6 left-6 right-6 w-[calc(100%-48px)] h-[calc(100%-48px)] rounded-2xl pointer-events-none z-10"
          />

          {/* 2. SVG Architectural Floorplan outlines overlay */}
          <div className="relative w-full flex justify-center items-center z-20">
            {isCokeOven ? (
              <svg viewBox="0 0 740 450" className="w-full max-w-[680px] h-auto drop-shadow-2xl">
                {/* Coke Oven Battery Architectural Line Art */}
                <g className="stroke-slate-700/80 stroke-[1.5px] fill-none">
                  {/* Outer Boundary Walls */}
                  <rect x="30" y="20" width="680" height="410" rx="10" className="stroke-slate-600/40" />
                  
                  {/* Gas Collection Main Room */}
                  <rect x="220" y="30" width="460" height="40" rx="4" />
                  
                  {/* Charging Room Platform */}
                  <rect x="220" y="90" width="460" height="40" rx="4" />
                  <line x1="280" y1="90" x2="280" y2="130" />
                  <line x1="380" y1="90" x2="380" y2="130" />
                  <line x1="480" y1="90" x2="480" y2="130" />
                  <line x1="580" y1="90" x2="580" y2="130" />
                  
                  {/* Coke Oven Battery 1 slots */}
                  <rect x="220" y="150" width="460" height="140" rx="6" />
                  {Array.from({ length: 15 }).map((_, i) => (
                    <line key={i} x1={240 + i * 28} y1="150" x2={240 + i * 28} y2="290" className="stroke-slate-800/40" />
                  ))}

                  {/* Control Room Office partitions */}
                  <rect x="50" y="320" width="150" height="90" rx="6" />
                  <line x1="120" y1="320" x2="120" y2="380" />
                  {/* Door Swing Arcs */}
                  <path d="M 120 380 A 20 20 0 0 1 100 400" className="stroke-slate-700/50" />
                  <line x1="100" y1="400" x2="120" y2="400" className="stroke-slate-700/50" />

                  {/* Quenching Tower vents */}
                  <rect x="530" y="320" width="150" height="90" rx="6" />
                  <circle cx="605" cy="365" r="22" className="stroke-slate-800/60" />
                  <circle cx="605" cy="365" r="10" className="stroke-slate-800/40" />
                  
                  {/* Connecting Rail lines */}
                  <line x1="50" y1="365" x2="690" y2="365" strokeDasharray="6,6" className="stroke-slate-600/50" />
                  <line x1="220" y1="220" x2="680" y2="220" strokeDasharray="4,4" className="stroke-slate-600/40" />
                </g>

                {/* ZONE LABELS AND ACTIVE RISK OVERLAYS */}
                {spatialLayout.map(z => {
                  const riskObj = currentRisks[z.zone_id];
                  const level = riskObj?.risk_level || 'low';
                  const labelColor = level === 'critical' || level === 'high' ? 'fill-red-400 font-black' :
                                     level === 'medium' ? 'fill-amber-400 font-extrabold' : 'fill-slate-300';
                  
                  return (
                    <g key={z.zone_id} className="cursor-pointer" onClick={() => onSelectZone(z.zone_id)}>
                      <text x={z.x} y={z.y - 4} className="fill-white text-[9px] font-black text-center pointer-events-none" textAnchor="middle">
                        {z.name}
                      </text>
                      <text x={z.x} y={z.y + 8} className={`${labelColor} text-[7.5px] uppercase tracking-wider font-mono text-center pointer-events-none`} textAnchor="middle">
                        {level} Risk
                      </text>
                    </g>
                  );
                })}

                {/* CAMERA MARKERS MODE */}
                {viewMode === 'camera' && spatialLayout.map(z => (
                  <g key={z.zone_id} className="cursor-pointer" onClick={() => onSelectCamera(z.zone_id)}>
                    <circle cx={z.x} cy={z.y - 20} r="10" className="fill-emerald-500/20 stroke-emerald-400 stroke-2 animate-pulse" />
                    <circle cx={z.x} cy={z.y - 20} r="3" className="fill-emerald-400" />
                  </g>
                ))}

                {/* SENSOR VALUE BADGES */}
                {viewMode === 'sensor' && (
                  <>
                    <g transform="translate(450, 42)" className="pointer-events-none font-mono">
                      <rect x="-30" y="-10" width="60" height="14" rx="3" className="fill-[#0c101b] stroke-slate-800" />
                      <text x="0" y="0" className="fill-emerald-400 text-[7px] text-center" textAnchor="middle">PPE: 98%</text>
                    </g>
                    <g transform="translate(450, 245)" className="pointer-events-none font-mono">
                      <rect x="-30" y="-10" width="60" height="14" rx="3" className="fill-[#0c101b] stroke-slate-800" />
                      <text x="0" y="0" className="fill-emerald-400 text-[7px] text-center" textAnchor="middle">Temp: 38°C</text>
                    </g>
                    <g transform="translate(125, 385)" className="pointer-events-none font-mono">
                      <rect x="-30" y="-10" width="60" height="14" rx="3" className="fill-[#0c101b] stroke-slate-800" />
                      <text x="0" y="0" className="fill-emerald-400 text-[7px] text-center" textAnchor="middle">O2: 20.9%</text>
                    </g>
                  </>
                )}

                {/* ZONE BOUNDARY LABELS */}
                {viewMode === 'zone' && (
                  <>
                    <g transform="translate(450, 258)" className="pointer-events-none font-mono">
                      <text x="0" y="0" className="fill-amber-400/80 text-[7.5px] uppercase tracking-wider text-center" textAnchor="middle">Restricted Battery Area</text>
                    </g>
                    <g transform="translate(125, 395)" className="pointer-events-none font-mono">
                      <text x="0" y="0" className="fill-emerald-400/80 text-[7.5px] uppercase tracking-wider text-center" textAnchor="middle">Office Admin Zone</text>
                    </g>
                  </>
                )}

                {/* ACTIVE ALERT PERSON/VIOLATION MARKERS */}
                {violations.map(v => {
                  if (v.status !== 'open') return null;
                  const zoneLayout = spatialLayout.find(z => z.zone_id === v.zone_id);
                  if (!zoneLayout) return null;

                  return (
                    <g key={v.id} className="cursor-pointer animate-bounce" onClick={() => onSelectZone(v.zone_id)}>
                      <circle cx={zoneLayout.x - 20} cy={zoneLayout.y + 18} r="8" className="fill-red-500 stroke-white stroke-2 shadow" />
                      <g transform={`translate(${zoneLayout.x - 26}, ${zoneLayout.y + 12})`}>
                        <UserX className="h-3 w-3 text-white" />
                      </g>
                    </g>
                  );
                })}

              </svg>
            ) : (
              <svg viewBox="0 0 740 450" className="w-full max-w-[680px] h-auto drop-shadow-2xl">
                {/* Rolling Mill Architectural Line Art */}
                <g className="stroke-slate-700/80 stroke-[1.5px] fill-none">
                  {/* Outer Wall */}
                  <rect x="30" y="20" width="680" height="410" rx="10" className="stroke-slate-600/40" />

                  {/* Reheating Furnace chambers */}
                  <rect x="50" y="50" width="150" height="240" rx="6" />
                  <line x1="50" y1="130" x2="200" y2="130" />
                  <line x1="50" y1="210" x2="200" y2="210" />

                  {/* Rolling Stand rolling mills */}
                  <rect x="240" y="100" width="120" height="140" rx="6" />
                  <circle cx="300" cy="140" r="12" className="stroke-slate-800/40" />
                  <circle cx="300" cy="200" r="12" className="stroke-slate-800/40" />
                  
                  {/* Cooling Bed slats */}
                  <rect x="400" y="50" width="140" height="240" rx="6" />
                  {Array.from({ length: 12 }).map((_, i) => (
                    <line key={i} x1="400" y1={60 + i * 18} x2="540" y2={60 + i * 18} className="stroke-slate-800/40" />
                  ))}

                  {/* Finishing Area shears */}
                  <rect x="580" y="100" width="110" height="140" rx="6" />
                  <line x1="580" y1="170" x2="690" y2="170" />
                  <circle cx="635" cy="170" r="18" className="stroke-slate-800/40" />

                  {/* Mill Control Room */}
                  <rect x="240" y="300" width="450" height="100" rx="6" />
                  <line x1="350" y1="300" x2="350" y2="400" />
                  <path d="M 350 360 A 20 20 0 0 1 330 380" className="stroke-slate-700/50" />
                  
                  {/* Rolling Tracks */}
                  <line x1="50" y1="170" x2="690" y2="170" className="stroke-slate-800/60" />
                  <line x1="50" y1="345" x2="690" y2="345" strokeDasharray="4,4" className="stroke-slate-600/40" />
                </g>

                {/* ZONE LABELS AND ACTIVE RISK OVERLAYS */}
                {spatialLayout.map(z => {
                  const riskObj = currentRisks[z.zone_id];
                  const level = riskObj?.risk_level || 'low';
                  const labelColor = level === 'critical' || level === 'high' ? 'fill-red-400 font-black' :
                                     level === 'medium' ? 'fill-amber-400 font-extrabold' : 'fill-slate-300';
                  
                  return (
                    <g key={z.zone_id} className="cursor-pointer" onClick={() => onSelectZone(z.zone_id)}>
                      <text x={z.x} y={z.y - 4} className="fill-white text-[9px] font-black text-center pointer-events-none" textAnchor="middle">
                        {z.name}
                      </text>
                      <text x={z.x} y={z.y + 8} className={`${labelColor} text-[7.5px] uppercase tracking-wider font-mono text-center pointer-events-none`} textAnchor="middle">
                        {level} Risk
                      </text>
                    </g>
                  );
                })}

                {/* CAMERA MARKERS MODE */}
                {viewMode === 'camera' && spatialLayout.map(z => (
                  <g key={z.zone_id} className="cursor-pointer" onClick={() => onSelectCamera(z.zone_id)}>
                    <circle cx={z.x} cy={z.y - 20} r="10" className="fill-emerald-500/20 stroke-emerald-400 stroke-2 animate-pulse" />
                    <circle cx={z.x} cy={z.y - 20} r="3" className="fill-emerald-400" />
                  </g>
                ))}

                {/* SENSOR VALUE OVERLAYS */}
                {viewMode === 'sensor' && (
                  <>
                    <g transform="translate(125, 195)" className="pointer-events-none font-mono">
                      <rect x="-30" y="-10" width="60" height="14" rx="3" className="fill-[#0c101b] stroke-slate-800" />
                      <text x="0" y="0" className="fill-emerald-400 text-[7px] text-center" textAnchor="middle">Temp: 920°C</text>
                    </g>
                    <g transform="translate(300, 195)" className="pointer-events-none font-mono">
                      <rect x="-30" y="-10" width="60" height="14" rx="3" className="fill-[#0c101b] stroke-slate-800" />
                      <text x="0" y="0" className="fill-emerald-400 text-[7px] text-center" textAnchor="middle">PPE: 85%</text>
                    </g>
                  </>
                )}

                {/* ZONE BOUNDARY LABELS */}
                {viewMode === 'zone' && (
                  <>
                    <g transform="translate(125, 208)" className="pointer-events-none font-mono">
                      <text x="0" y="0" className="fill-red-400/80 text-[7.5px] uppercase tracking-wider text-center" textAnchor="middle">Hazard Reheat zone</text>
                    </g>
                  </>
                )}

                {/* ACTIVE ALERT PERSON MARKERS */}
                {violations.map(v => {
                  if (v.status !== 'open') return null;
                  const zoneLayout = spatialLayout.find(z => z.zone_id === v.zone_id);
                  if (!zoneLayout) return null;

                  return (
                    <g key={v.id} className="cursor-pointer animate-bounce" onClick={() => onSelectZone(v.zone_id)}>
                      <circle cx={zoneLayout.x - 20} cy={zoneLayout.y + 18} r="8" className="fill-red-500 stroke-white stroke-2 shadow" />
                      <g transform={`translate(${zoneLayout.x - 26}, ${zoneLayout.y + 12})`}>
                        <UserX className="h-3 w-3 text-white" />
                      </g>
                    </g>
                  );
                })}

              </svg>
            )}
          </div>

        </div>

        {/* Right Side: Legend & Active Alerts list */}
        <div className="xl:col-span-1 flex flex-col gap-6">
          
          {/* Risk Legend */}
          <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md">
            <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Risk Levels</h4>
            
            <div className="flex flex-col gap-3 text-xs font-semibold mt-1">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-red-500 shadow animate-pulse" />
                <span className="text-theme-text-secondary">High / Critical</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-amber-500 shadow" />
                <span className="text-theme-text-secondary">Medium / Elevated</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-emerald-500 shadow" />
                <span className="text-theme-text-secondary">Low / Safe</span>
              </div>
            </div>
          </div>

          {/* Active Alerts */}
          <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md">
            <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Active Alerts</h4>
            
            <div className="flex-1 flex flex-col gap-4.5 text-xs font-semibold mt-1">
              {activeAlertsList.length === 0 ? (
                <div className="py-6 text-center text-theme-text-muted text-[10px] uppercase font-black">
                  No Active Alerts
                </div>
              ) : (
                activeAlertsList.map(item => (
                  <div
                    key={item.zoneId}
                    onClick={() => onSelectZone(item.zoneId)}
                    className="flex items-center justify-between border-b border-theme-border pb-3 last:border-b-0 last:pb-0 cursor-pointer hover:text-emerald-400 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                      <span className="text-theme-text">{item.name}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black font-mono bg-red-500/10 text-red-400 border border-red-500/20">
                      {item.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Bottom stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Total Cameras */}
        <div className="bg-theme-card border border-theme-border p-4.5 rounded-2xl flex flex-col justify-between shadow-sm relative">
          <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">Total Cameras</span>
          <div className="flex items-baseline gap-1 mt-2.5">
            <span className="text-xl font-black text-theme-text">{stats.totalCameras}</span>
            <span className="text-[8.5px] font-bold text-theme-text-muted">Online</span>
          </div>
        </div>

        {/* Active Alerts */}
        <div className="bg-theme-card border border-theme-border p-4.5 rounded-2xl flex flex-col justify-between shadow-sm relative">
          <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">Active Alerts</span>
          <div className="flex items-baseline gap-1 mt-2.5">
            <span className={`text-xl font-black ${stats.activeAlerts > 0 ? 'text-red-400 animate-pulse' : 'text-theme-text'}`}>
              {stats.activeAlerts}
            </span>
          </div>
        </div>

        {/* Risk Score */}
        <div className="bg-theme-card border border-theme-border p-4.5 rounded-2xl flex flex-col justify-between shadow-sm relative">
          <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">Risk Score</span>
          <div className="flex items-baseline gap-1 mt-2.5">
            <span className="text-xl font-black text-theme-text">{stats.safetyScore}%</span>
            <span className="text-[8.5px] font-bold text-emerald-400">Excellent</span>
          </div>
        </div>

        {/* Safe Zones */}
        <div className="bg-theme-card border border-theme-border p-4.5 rounded-2xl flex flex-col justify-between shadow-sm relative">
          <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">Safe Zones</span>
          <div className="flex items-baseline gap-1 mt-2.5">
            <span className="text-xl font-black text-theme-text">{stats.safeZonesPct}%</span>
          </div>
        </div>

      </div>

    </div>
  );
}
