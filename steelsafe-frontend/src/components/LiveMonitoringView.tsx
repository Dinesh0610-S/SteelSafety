import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Camera, Users, AlertTriangle, Activity, 
  ShieldAlert, ShieldCheck, RefreshCw, Search, ChevronDown, 
  ArrowUpRight, AlertCircle, Flame
} from 'lucide-react';
import type { RiskStatus } from '../hooks/usePlantData';
import { 
  ResponsiveContainer, AreaChart, Area, LineChart, Line
} from 'recharts';
import { useCamera } from '../context/CameraContext';
import { LiveWebcamCameraTile } from './camera/LiveWebcamCameraTile';
import { RecordedFeedTile } from './camera/RecordedFeedTile';
import type { CameraInfo } from './camera/RecordedFeedTile';

interface LiveMonitoringViewProps {
  activePlantId: string;
  currentRisks: Record<string, RiskStatus>;
  t0: Date | null;
  ppeViolations: any[];
  deviations: ComplianceDeviation[];
  onPPEViolation: (event: any) => void;
  onSelectCamera: (id: string) => void;
}

interface ComplianceDeviation {
  id: number;
  plant_id: string;
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

const ZONE_TEMPERATURE_BASELINES: Record<string, number> = {
  "zone_cob1": 1020.0,
  "zone_gcm":  220.0,
  "zone_qt":   150.0,
  "zone_ca":   45.0,
  "zone_cr":   25.0,
  "zone_rs":   22.0,
  "zone_cb":   38.0,
  "zone_fl":   24.0,
  "zone_cr2":  25.0,
};

export function LiveMonitoringView({
  currentRisks,
  ppeViolations,
  deviations,
  onSelectCamera
}: LiveMonitoringViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // System Health Sparkline simulation states
  const [latencyData, setLatencyData] = useState<any[]>([]);
  const [processingData, setProcessingData] = useState<any[]>([]);
  const [gpuUsage, setGpuUsage] = useState(65);

  // Consume global camera state
  const {
    webcamActive,
    cameraFps,
  } = useCamera();

  // System stats generator
  useEffect(() => {
    const generateStats = () => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLatencyData(prev => [...prev.slice(-15), { time, val: Math.floor(Math.random() * 6) + 15 }]);
      setProcessingData(prev => [...prev.slice(-15), { time, val: Math.floor(Math.random() * 4) + 30 }]);
      setGpuUsage(prev => {
        const change = Math.floor(Math.random() * 5) - 2;
        const next = prev + change;
        return Math.max(55, Math.min(80, next));
      });
    };
    generateStats();
    const interval = setInterval(generateStats, 1500);
    return () => clearInterval(interval);
  }, []);

  // Compile active alerts / violations for stats & feeds
  const activeAlertsCount = useMemo(() => {
    const activePPE = ppeViolations.filter(v => v.status === 'open').length;
    const activeDevs = deviations.filter(d => !d.resolved).length;
    return activePPE + activeDevs;
  }, [ppeViolations, deviations]);

  const parsedRisks = useMemo(() => {
    return Object.values(currentRisks).map((risk) => {
      const snapJson = risk.signal_snapshot;
      let snap: any = null;
      if (snapJson) {
        try {
          snap = JSON.parse(snapJson);
        } catch {
          // Fallback
        }
      }
      return { ...risk, snap };
    });
  }, [currentRisks]);

  const gasThermalAlertsCount = useMemo(() => {
    let count = 0;
    parsedRisks.forEach(r => {
      if (r.snap) {
        const co = r.snap.co_ppm || 0;
        const h2s = r.snap.h2s_ppm || 0;
        const temp = r.snap.temperature_c || 0;
        const baseline = ZONE_TEMPERATURE_BASELINES[r.zone_id] || 0;
        const isCoElevated = co >= 35.0;
        const isH2sElevated = h2s >= 5.0;
        const isTempHigh = baseline > 0 && (temp - baseline) >= 50.0;
        if (isCoElevated || isH2sElevated || isTempHigh) {
          count++;
        }
      }
    });
    return count;
  }, [parsedRisks]);

  const activeCriticalZonesCount = useMemo(() => {
    return parsedRisks.filter(r => r.risk_level === 'critical' || r.risk_level === 'high').length;
  }, [parsedRisks]);

  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [liveStats, setLiveStats] = useState<{
    active_cameras: number;
    total_cameras: number;
    workers_detected: number;
    ai_alerts_today: number;
    avg_fps: number;
  } | null>(null);

  const fetchLiveCamerasAndStats = useCallback(async () => {
    try {
      const [camsRes, statsRes] = await Promise.all([
        fetch('/api/live/cameras'),
        fetch('/api/live/stats'),
      ]);
      if (camsRes.ok) {
        const data = await camsRes.json();
        setCameras(data);
      }
      if (statsRes.ok) {
        const s = await statsRes.json();
        setLiveStats(s);
      }
    } catch (err) {
      console.warn('Failed fetching live cameras/stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchLiveCamerasAndStats();
    const interval = setInterval(fetchLiveCamerasAndStats, 2500);
    return () => clearInterval(interval);
  }, [fetchLiveCamerasAndStats]);

  const cam01 = useMemo<CameraInfo>(() => {
    return cameras.find(c => c.id === 'CAM01') || {
      id: 'CAM01',
      label: 'CAM 01 - Coke Oven Battery',
      zone: 'Coke Oven Battery',
      source_type: 'webcam',
      is_live: webcamActive,
      feed_badge: 'LIVE WEBCAM',
      status: webcamActive ? 'Online' : 'Offline',
      status_color: webcamActive ? '#10b981' : '#ef4444',
      frame_url: '/api/live/frame/CAM01',
    };
  }, [cameras, webcamActive]);

  const cam02 = useMemo<CameraInfo>(() => {
    return cameras.find(c => c.id === 'CAM02') || {
      id: 'CAM02',
      label: 'CAM 02 - Blast Furnace Zone',
      zone: 'Blast Furnace Zone',
      source_type: 'video_file',
      is_live: false,
      feed_badge: 'RECORDED FEED',
      status: 'Online',
      status_color: '#10b981',
      frame_url: '/api/live/frame/CAM02',
    };
  }, [cameras]);

  const cam03 = useMemo<CameraInfo>(() => {
    return cameras.find(c => c.id === 'CAM03') || {
      id: 'CAM03',
      label: 'CAM 03 - Gas Cleaning Plant',
      zone: 'Gas Cleaning Plant',
      source_type: 'video_file',
      is_live: false,
      feed_badge: 'RECORDED FEED',
      status: 'Online',
      status_color: '#10b981',
      frame_url: '/api/live/frame/CAM03',
    };
  }, [cameras]);

  // Stat Row counts across exactly the 3 cameras
  const statsRow = useMemo(() => {
    const totalWorkers = liveStats?.workers_detected ?? parsedRisks.reduce((acc, curr) => acc + (curr.snap?.workers_in_zone || 0), 0);
    const activeCount = liveStats?.active_cameras ?? ((webcamActive ? 1 : 0) + (cam02?.status === 'Online' ? 1 : 0) + (cam03?.status === 'Online' ? 1 : 0));
    return {
      activeCameras: activeCount,
      totalCameras: 3,
      workersDetected: totalWorkers,
      alertsToday: liveStats?.ai_alerts_today ?? (activeAlertsCount + gasThermalAlertsCount + activeCriticalZonesCount),
      fps: liveStats?.avg_fps || (webcamActive ? cameraFps : 30),
    };
  }, [liveStats, parsedRisks, webcamActive, cam02, cam03, cameraFps, activeAlertsCount, gasThermalAlertsCount, activeCriticalZonesCount]);

  // Right column Timeline Events
  const liveEvents = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      desc: string;
      zone: string;
      time: string;
      icon: any;
      iconColor: string;
      iconBg: string;
      timestampDate: Date;
    }> = [];

    ppeViolations.forEach((v, idx) => {
      const isResolved = v.status === 'resolved';
      const timeStr = new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      list.push({
        id: `ppe_${v.id || idx}`,
        title: isResolved ? 'PPE Restored' : 'Helmet Missing',
        desc: `Worker: ${v.worker_name || 'Raj'} | ID: ${v.id || 204}`,
        zone: v.zone_name,
        time: timeStr,
        icon: isResolved ? ShieldCheck : ShieldAlert,
        iconColor: isResolved ? 'text-emerald-400' : 'text-red-400',
        iconBg: isResolved ? 'bg-emerald-500/10' : 'bg-red-500/10',
        timestampDate: new Date(v.timestamp),
      });
    });

    deviations.forEach((d, idx) => {
      const timeStr = new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      list.push({
        id: `dev_${d.id || idx}`,
        title: 'Restricted Entry',
        desc: d.deviation_type.split(':')[0],
        zone: d.zone_id || 'Robot Zone',
        time: timeStr,
        icon: AlertTriangle,
        iconColor: 'text-orange-400',
        iconBg: 'bg-orange-500/10',
        timestampDate: new Date(d.timestamp),
      });
    });

    parsedRisks.forEach((r, idx) => {
      if (r.risk_level === 'critical' || r.risk_level === 'high') {
        const timeStr = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        list.push({
          id: `risk_${r.zone_id || idx}`,
          title: 'Fall Detected',
          desc: 'Worker stability alarm triggered',
          zone: r.zone_id,
          time: timeStr,
          icon: AlertCircle,
          iconColor: 'text-amber-400',
          iconBg: 'bg-amber-500/10',
          timestampDate: new Date(r.timestamp),
        });
      }
    });

    list.sort((a, b) => b.timestampDate.getTime() - a.timestampDate.getTime());

    if (list.length === 0) {
      return [
        {
          id: 'mock1',
          title: 'Helmet Missing',
          desc: 'Worker ID: 204 | Assembly Line',
          zone: 'Assembly Line',
          time: '12:25 AM',
          icon: ShieldAlert,
          iconColor: 'text-red-400',
          iconBg: 'bg-red-500/10'
        },
        {
          id: 'mock2',
          title: 'Smoke Detected',
          desc: 'Carbon monoxide bump detected',
          zone: 'Boiler Room',
          time: '11:35 AM',
          icon: Flame,
          iconColor: 'text-[#c084fc]',
          iconBg: 'bg-[#a855f7]/10'
        },
        {
          id: 'mock3',
          title: 'Restricted Entry',
          desc: 'Zone intrusion triggered',
          zone: 'Robot Zone',
          time: '10:23 AM',
          icon: AlertTriangle,
          iconColor: 'text-orange-400',
          iconBg: 'bg-orange-500/10'
        },
        {
          id: 'mock4',
          title: 'Fall Detected',
          desc: 'Accelerometer discrepancy check',
          zone: 'Warehouse',
          time: '10:21 AM',
          icon: AlertCircle,
          iconColor: 'text-amber-400',
          iconBg: 'bg-amber-500/10'
        },
        {
          id: 'mock5',
          title: 'Helmet Missing',
          desc: 'Worker ID: 118 | Loading Bay',
          zone: 'Loading Bay',
          time: '10:19 AM',
          icon: ShieldAlert,
          iconColor: 'text-red-400',
          iconBg: 'bg-red-500/10'
        }
      ];
    }

    return list.slice(0, 10);
  }, [ppeViolations, deviations, parsedRisks]);

  // Mini Floor Plan Coordinate mapping
  const plantMapDots = useMemo(() => {
    const coordinates: Record<string, { x: number; y: number }> = {
      "zone_cob1": { x: 70, y: 35 },
      "zone_gcm": { x: 140, y: 75 },
      "zone_qt": { x: 230, y: 35 },
      "zone_ca": { x: 190, y: 110 },
      "zone_cr": { x: 90, y: 130 },
      "zone_rhf": { x: 70, y: 35 },
      "zone_rs": { x: 140, y: 75 },
      "zone_cb": { x: 230, y: 35 },
      "zone_fl": { x: 190, y: 110 },
      "zone_cr2": { x: 90, y: 130 },
    };

    return parsedRisks.map(r => {
      const coords = coordinates[r.zone_id] || { x: 150, y: 75 };
      let dotColor = 'fill-emerald-500';
      if (r.risk_level === 'medium') dotColor = 'fill-amber-500';
      if (r.risk_level === 'high' || r.risk_level === 'critical') dotColor = 'fill-red-500 animate-pulse';
      return { id: r.zone_id, ...coords, dotColor };
    });
  }, [parsedRisks]);

  return (
    <div id="live-monitoring-page" className="flex flex-col gap-6 w-full text-slate-100">
      
      {/* 1. Header controls in content area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col leading-tight">
          <h2 className="text-xl font-black tracking-tight text-white m-0">
            1. LIVE MONITORING
          </h2>
          <p className="text-[11px] text-slate-400 font-bold mt-1.5">
            Real-time AI Surveillance Across All Factory Zones
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3.5">
          {/* Search cameras input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search Camera..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-theme-bg border border-theme-border pl-9 pr-4 py-2 rounded-xl text-xs text-theme-text placeholder-theme-text-muted focus:outline-none focus:border-emerald-500 w-44 font-semibold shadow-inner"
            />
          </div>

          {/* Zones Dropdown */}
          <div className="relative">
            <select
              value={selectedZoneFilter}
              onChange={(e) => setSelectedZoneFilter(e.target.value)}
              className="bg-theme-bg border border-theme-border px-3.5 py-2 pr-8 rounded-xl text-xs text-theme-text-secondary font-semibold focus:outline-none appearance-none cursor-pointer shadow-inner"
            >
              <option value="All">All Zones</option>
              <option value="Coke Oven">Coke Oven</option>
              <option value="Rolling Mill">Rolling Mill</option>
            </select>
            <ChevronDown className="absolute right-3.5 top-3 h-3 w-3 text-slate-500 pointer-events-none" />
          </div>

          {/* Status Dropdown */}
          <div className="relative">
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-theme-bg border border-theme-border px-3.5 py-2 pr-8 rounded-xl text-xs text-theme-text-secondary font-semibold focus:outline-none appearance-none cursor-pointer shadow-inner"
            >
              <option value="All">All Statuses</option>
              <option value="Safe">Safe</option>
              <option value="Alerts">Alerts</option>
            </select>
            <ChevronDown className="absolute right-3.5 top-3 h-3 w-3 text-slate-500 pointer-events-none" />
          </div>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(prev => !prev)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all shadow-sm ${
              autoRefresh 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-theme-bg border-theme-border text-theme-text-muted'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh
          </button>
        </div>
      </div>

      {/* 2. Top stat row (4 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Cameras */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-[#10b981]/50 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">Active Cameras</span>
              <h3 className="text-2xl font-black font-mono text-theme-text mt-0.5">{statsRow.activeCameras}</h3>
            </div>
          </div>
        </div>

        {/* Card 2: Workers Detected */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-[#10b981]/50 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">Workers Detected</span>
              <h3 className="text-2xl font-black font-mono text-theme-text mt-0.5">{statsRow.workersDetected}</h3>
            </div>
          </div>
        </div>

        {/* Card 3: AI Alerts Today */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-red-500/50 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold">
              <AlertTriangle className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">AI Alerts Today</span>
              <h3 className="text-2xl font-black font-mono text-theme-text mt-0.5">{statsRow.alertsToday}</h3>
            </div>
          </div>
        </div>

        {/* Card 4: FPS */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-[#10b981]/50 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#c084fc]/10 border border-[#c084fc]/20 text-[#c084fc]">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">FPS</span>
              <h3 className="text-2xl font-black font-mono text-theme-text mt-0.5">{statsRow.fps}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace Grid: CCTV Panel (Left) + Live Events (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-stretch">
        
        {/* Left Column: 3 Cameras Grid + bottom row indicators */}
        <div className="xl:col-span-3 flex flex-col gap-6">
          
          {/* Camera Grid: 3-Camera Layout (CAM01 60% Left, CAM02 & CAM03 Stacked Right) */}
          <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: CAM 01 (Live Laptop Webcam ~60% width) */}
              <div className="lg:col-span-7 xl:col-span-7">
                <LiveWebcamCameraTile
                  cameraId={cam01.id}
                  label={cam01.label}
                  zone={cam01.zone}
                  onSelectCamera={onSelectCamera}
                />
              </div>

              {/* Right Column: Stacked Recorded Feeds (CAM 02 & CAM 03) */}
              <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-5">
                <RecordedFeedTile
                  camera={cam02}
                  onSelectCamera={onSelectCamera}
                />
                <RecordedFeedTile
                  camera={cam03}
                  onSelectCamera={onSelectCamera}
                />
              </div>
            </div>
          </div>

          {/* Bottom row metrics (4 cards) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Widget 1: Factory Map (Heatmap Floor Plan) */}
            <div className="md:col-span-4 bg-theme-card border border-theme-border rounded-3xl p-4 flex flex-col gap-3 min-h-[190px]">
              <h4 className="text-[10px] uppercase font-extrabold tracking-widest text-theme-text-muted">Factory Map</h4>
              <div className="flex-1 bg-theme-well rounded-2xl relative border border-theme-border overflow-hidden flex items-center justify-center p-2">
                <svg className="w-full h-full max-h-[120px]" viewBox="0 0 300 150">
                  {/* Outer boundary wall */}
                  <rect x="10" y="10" width="280" height="130" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="4 2" />
                  {/* Internal separation lines */}
                  <line x1="100" y1="10" x2="100" y2="140" stroke="#1e293b" strokeWidth="2" />
                  <line x1="200" y1="10" x2="200" y2="140" stroke="#1e293b" strokeWidth="2" />
                  <line x1="100" y1="60" x2="200" y2="60" stroke="#1e293b" strokeWidth="2" />

                  {/* Blueprint zone label outlines */}
                  <text x="50" y="25" fill="#475569" fontSize="8" fontWeight="bold" textAnchor="middle">ENTRANCE</text>
                  <text x="150" y="25" fill="#475569" fontSize="8" fontWeight="bold" textAnchor="middle">MILL ENTRY</text>
                  <text x="250" y="25" fill="#475569" fontSize="8" fontWeight="bold" textAnchor="middle">BOILER</text>
                  <text x="150" y="85" fill="#475569" fontSize="8" fontWeight="bold" textAnchor="middle">ASSEMBLY</text>
                  <text x="250" y="85" fill="#475569" fontSize="8" fontWeight="bold" textAnchor="middle">WAREHOUSE</text>

                  {/* Heatmap Dots */}
                  {plantMapDots.map(dot => (
                    <circle key={dot.id} cx={dot.x} cy={dot.y} r="5" className={dot.dotColor} />
                  ))}
                </svg>
              </div>
            </div>

            {/* Widget 2: Camera Health (Circular Gauge) */}
            <div className="md:col-span-3 bg-theme-card border border-theme-border rounded-3xl p-4 flex flex-col items-center justify-between min-h-[190px]">
              <h4 className="text-[10px] uppercase font-extrabold tracking-widest text-theme-text-muted self-start">Camera Health</h4>
              
              <div className="relative h-24 w-24 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="36"
                    fill="transparent"
                    stroke="rgba(30, 41, 59, 0.4)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="36"
                    fill="transparent"
                    stroke="#10b981"
                    strokeWidth="6"
                    strokeDasharray={2 * Math.PI * 36}
                    strokeDashoffset={(2 * Math.PI * 36) - (statsRow.activeCameras / 3.0) * (2 * Math.PI * 36)}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-xl font-black font-mono text-theme-text leading-none">
                    {Math.round((statsRow.activeCameras / 3.0) * 100)}%
                  </span>
                  <span className="text-[7.5px] uppercase font-mono font-bold text-theme-text-muted mt-0.5">Online</span>
                </div>
              </div>
              
              <span className="text-[8.5px] font-mono font-bold text-theme-text-muted">
                {statsRow.activeCameras} / 3 Active
              </span>
            </div>

            {/* Widget 3: GPU Usage (Bar progress + fluctuation) */}
            <div className="md:col-span-2 bg-theme-card border border-theme-border rounded-3xl p-4 flex flex-col justify-between min-h-[190px]">
              <h4 className="text-[10px] uppercase font-extrabold tracking-widest text-theme-text-muted">GPU Usage</h4>
              
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-black font-mono text-theme-text">{gpuUsage}%</span>
                  <span className="text-[7.5px] font-mono font-bold text-[#c084fc] bg-[#c084fc]/10 px-1.5 py-0.5 rounded border border-[#c084fc]/20 uppercase">AI Load</span>
                </div>
                
                {/* Visual stacked bars matching reference mockup visual cue */}
                <div className="flex flex-col gap-1 w-full">
                  {[...Array(6)].map((_, idx) => {
                    const fillValue = (idx + 1) * 16.6;
                    const isActive = gpuUsage >= fillValue;
                    return (
                      <div 
                        key={idx} 
                        className={`h-2.5 rounded-sm transition-all duration-300 ${
                          isActive 
                            ? 'bg-gradient-to-r from-emerald-500 to-indigo-500 opacity-90' 
                            : 'bg-slate-900 border border-slate-800'
                        }`} 
                      />
                    );
                  })}
                </div>
              </div>

              <span className="text-[7.5px] font-mono text-theme-text-muted font-semibold uppercase">Illustrative Probe</span>
            </div>

            {/* Widget 4: Network Latency & AI Processing Speed Sparklines */}
            <div className="md:col-span-3 bg-theme-card border border-theme-border rounded-3xl p-4 flex flex-col justify-between min-h-[190px]">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-baseline border-b border-theme-border pb-1.5">
                  <span className="text-[10px] font-extrabold text-theme-text-muted uppercase">Network Latency</span>
                  <span className="text-xs font-black font-mono text-emerald-400">
                    {latencyData.slice(-1)[0]?.val || 18} ms
                  </span>
                </div>
                <div className="w-full h-[40px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={latencyData} margin={{ top: 2, bottom: 2 }}>
                      <Line type="monotone" dataKey="val" stroke="#10b981" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <div className="flex justify-between items-baseline border-b border-theme-border pb-1.5">
                  <span className="text-[10px] font-extrabold text-theme-text-muted uppercase">AI Processing Speed</span>
                  <span className="text-xs font-black font-mono text-[#c084fc]">
                    {processingData.slice(-1)[0]?.val || 32} FPS
                  </span>
                </div>
                <div className="w-full h-[40px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={processingData} margin={{ top: 2, bottom: 2 }}>
                      <Area type="monotone" dataKey="val" stroke="#c084fc" fill="rgba(168,85,247,0.1)" strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Live Events Feed Panel */}
        <div className="xl:col-span-1 bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 self-stretch min-h-[500px]">
          <div className="flex items-center justify-between border-b border-theme-border pb-3 shrink-0">
            <h3 className="text-sm font-extrabold tracking-tight text-theme-text uppercase">Live Events</h3>
            <a href="#alerts" className="text-[10px] font-mono font-bold text-theme-text-secondary hover:text-theme-text flex items-center gap-0.5 transition-all">
              View All <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>

          <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[600px] pr-0.5">
            {liveEvents.map((evt, idx) => (
              <div key={evt.id || idx} className="flex items-start justify-between p-3 rounded-2xl bg-theme-bg-alt border border-theme-border hover:border-theme-border-hover transition-all gap-2.5 group">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${evt.iconBg} ${evt.iconColor}`}>
                    <evt.icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="text-[11.5px] font-extrabold text-theme-text uppercase tracking-wide truncate">
                      {evt.title}
                    </span>
                    <span className="text-[9.5px] text-theme-text-secondary truncate mt-1">
                      {evt.desc}
                    </span>
                    <span className="text-[8px] font-mono font-black text-theme-text-muted uppercase mt-1">
                      Zone: {evt.zone}
                    </span>
                  </div>
                </div>
                <span className="text-[8px] font-mono font-bold text-theme-text-muted shrink-0 mt-0.5">{evt.time}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
