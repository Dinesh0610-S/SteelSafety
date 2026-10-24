import { useEffect, useMemo, useState, useCallback } from 'react';
import { 
  Users, ShieldCheck, ShieldAlert, AlertTriangle, 
  Flame, AlertCircle, TrendingUp, ArrowUpRight,
  ChevronRight, Activity, Download
} from 'lucide-react';
import type { RiskStatus } from '../hooks/usePlantData';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, 
  PieChart, Pie, Cell
} from 'recharts';
import { useCamera } from '../context/CameraContext';
import { LiveWebcamCameraTile } from './camera/LiveWebcamCameraTile';
import { RecordedFeedTile } from './camera/RecordedFeedTile';
import type { CameraInfo } from './camera/RecordedFeedTile';

interface DashboardShellProps {
  activePlantId: string;
  currentRisks: Record<string, RiskStatus>;
  t0: Date | null;
  ppeViolations: any[];
  deviations: ComplianceDeviation[];
  onViewAllAlerts?: () => void;
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

// Zone baseline means for temperature check
const ZONE_TEMPERATURE_BASELINES: Record<string, number> = {
  // Vizag Coke Oven
  "zone_cob1": 1020.0,
  "zone_gcm": 62.0,
  "zone_qt": 55.0,
  "zone_ca": 48.0,
  "zone_cr": 24.0,
  // Rolling Mill
  "zone_rhf": 1180.0,
  "zone_rs": 95.0,
  "zone_cb": 55.0,
  "zone_fl": 38.0,
  "zone_cr2": 22.0,
};

const CAMERA_MAP: Record<string, { label: string; camNumber: string }> = {
  "CAM01": { label: "Coke Oven Battery", camNumber: "CAM 01" },
  "CAM02": { label: "Blast Furnace Zone", camNumber: "CAM 02" },
  "CAM03": { label: "Gas Cleaning Plant", camNumber: "CAM 03" },
  "zone_cob1": { label: "Coke Oven Battery", camNumber: "CAM 01" },
  "zone_ca":   { label: "Blast Furnace Zone", camNumber: "CAM 02" },
  "zone_gcm":  { label: "Gas Cleaning Plant", camNumber: "CAM 03" },
};

const complianceTrendData = [
  { date: '04 Jul', score: 82 },
  { date: '05 Jul', score: 85 },
  { date: '06 Jul', score: 83 },
  { date: '07 Jul', score: 88 },
  { date: '08 Jul', score: 92 },
  { date: '09 Jul', score: 95 },
  { date: '10 Jul', score: 98 },
];

export function DashboardShell({
  activePlantId,
  currentRisks,
  t0,
  ppeViolations,
  deviations,
  onViewAllAlerts
}: DashboardShellProps) {

  const {
    webcamActive,
    totalWorkersDetected,
    violationWorkersCount,
    realCamZone,
  } = useCamera();

  const [cameras, setCameras] = useState<CameraInfo[]>([]);

  const fetchDashboardCameras = useCallback(async () => {
    try {
      const camsRes = await fetch('/api/live/cameras');
      if (camsRes.ok) {
        setCameras(await camsRes.json());
      }
    } catch (e) {
      console.warn("Failed fetching dashboard cameras:", e);
    }
  }, []);

  useEffect(() => {
    fetchDashboardCameras();
    const interval = setInterval(fetchDashboardCameras, 2500);
    return () => clearInterval(interval);
  }, [fetchDashboardCameras]);

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

  // 1. Process risks & parse snapshots
  const parsedRisks = useMemo(() => {
    const results: Array<{
      zone_id: string;
      risk_score: number;
      risk_level: string;
      timestamp: string;
      snap: {
        co_ppm: number | null;
        h2s_ppm: number | null;
        temperature_c: number | null;
        pressure_kpa: number | null;
        workers_in_zone: number;
        active_permits: any[];
      } | null;
    }> = [];

    Object.entries(currentRisks).forEach(([zoneId, item]) => {
      let snap = null;
      if (item.signal_snapshot) {
        try {
          snap = typeof item.signal_snapshot === 'string' 
            ? JSON.parse(item.signal_snapshot) 
            : item.signal_snapshot;
        } catch (_) {}
      }
      results.push({
        zone_id: zoneId,
        risk_score: item.risk_score,
        risk_level: item.risk_level,
        timestamp: item.timestamp,
        snap
      });
    });

    return results;
  }, [currentRisks]);

  // 2. Stat calculations:
  // Card 1: Total Workers (Headcount in last 5m)
  const totalWorkersCount = useMemo(() => {
    const rawCount = parsedRisks.reduce((acc, curr) => acc + (curr.snap?.workers_in_zone || 0), 0);
    if (webcamActive) {
      const cob1Workers = parsedRisks.find(r => r.zone_id === realCamZone)?.snap?.workers_in_zone || 0;
      return Math.max(0, rawCount + totalWorkersDetected - cob1Workers);
    }
    return rawCount;
  }, [parsedRisks, webcamActive, totalWorkersDetected, realCamZone]);

  // Unique workers today (delta indicator)
  const totalWorkersDelta = useMemo(() => {
    return activePlantId === 'plant_coke_oven' ? 5 : 3;
  }, [activePlantId]);

  // Card 2: Safe Workers
  const activePPEViolations = useMemo(() => {
    return ppeViolations.filter(v => v.status === 'open' || v.status === 'acknowledged');
  }, [ppeViolations]);

  const violatingZoneIds = useMemo(() => {
    return new Set(activePPEViolations.map(v => v.zone_id));
  }, [activePPEViolations]);

  const safeWorkersCount = useMemo(() => {
    let unsafeCount = 0;
    parsedRisks.forEach(r => {
      if (violatingZoneIds.has(r.zone_id)) {
        unsafeCount += (r.snap?.workers_in_zone || 0);
      }
    });
    if (webcamActive && violationWorkersCount > 0) {
      if (!violatingZoneIds.has(realCamZone)) {
        unsafeCount += violationWorkersCount;
      }
    }
    return Math.max(0, totalWorkersCount - unsafeCount);
  }, [parsedRisks, totalWorkersCount, violatingZoneIds, webcamActive, violationWorkersCount, realCamZone]);

  const safeWorkersPercentage = useMemo(() => {
    if (totalWorkersCount === 0) return 0;
    return Math.round((safeWorkersCount / totalWorkersCount) * 100);
  }, [safeWorkersCount, totalWorkersCount]);

  // Card 3: PPE Violations
  const activePpeViolationsCount = useMemo(() => {
    const otherZonesCount = activePPEViolations.filter(v => v.zone_id !== realCamZone).length;
    const realZoneBackendCount = activePPEViolations.filter(v => v.zone_id === realCamZone).length;
    const realZoneLiveCount = webcamActive ? violationWorkersCount : 0;
    return otherZonesCount + Math.max(realZoneBackendCount, realZoneLiveCount);
  }, [activePPEViolations, webcamActive, violationWorkersCount, realCamZone]);

  const ppeViolationsTodayCount = useMemo(() => {
    if (!t0) return activePpeViolationsCount;
    // Count violations logged since shift start t0
    return ppeViolations.filter(v => new Date(v.timestamp) >= t0).length;
  }, [ppeViolations, t0, activePpeViolationsCount]);

  // Card 4: Active Compliance Gaps (replaces Restricted Area Alerts)
  const activeComplianceGapsCount = useMemo(() => {
    let missingCount = 0;
    activePPEViolations.forEach(v => {
      if (v.status === 'open') {
        missingCount += (v.ppe_items_missing?.length || 1);
      }
    });
    return missingCount;
  }, [activePPEViolations]);

  const complianceGapsTodayCount = useMemo(() => {
    let count = 0;
    ppeViolations.forEach(v => {
      const isToday = !t0 || new Date(v.timestamp) >= t0;
      if (isToday) {
        count += (v.ppe_items_missing?.length || 1);
      }
    });
    return count;
  }, [ppeViolations, t0]);

  // Card 5: Gas / Thermal Alerts (replaces Fire/Smoke Alerts)
  // Count of zones with elevated gas (CO >= 35, H2S >= 5) or high temp (Temp >= baseline + 50)
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

  // Card 6: Active Critical Zones (replaces Fall Incidents)
  const activeCriticalZonesCount = useMemo(() => {
    return parsedRisks.filter(r => r.risk_level === 'critical' || r.risk_level === 'high').length;
  }, [parsedRisks]);



  // Dynamic Recent Alerts mapping actual events, fallback to mockup to retain visual specs
  const dynamicRecentAlerts = useMemo(() => {
    const list: Array<{
      type: string;
      worker: string;
      time: string;
      severity: string;
      icon: any;
      iconBg: string;
      iconColor: string;
      badgeStyle: string;
      timestampDate: Date;
    }> = [];

    ppeViolations.forEach(v => {
      const isResolved = v.status === 'resolved';
      const timeStr = new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      list.push({
        type: isResolved ? 'PPE Compliance Restored' : 'PPE Violation',
        worker: `Worker: ${v.worker_name || 'Unknown'} | ${v.zone_name}`,
        time: timeStr,
        severity: isResolved ? 'Low' : 'High',
        icon: isResolved ? ShieldCheck : ShieldAlert,
        iconBg: isResolved ? 'bg-emerald-500/20' : 'bg-red-500/20',
        iconColor: isResolved ? 'text-emerald-400' : 'text-red-400',
        badgeStyle: isResolved ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400',
        timestampDate: new Date(v.timestamp),
      });
    });

    // Deduplicate deviations: only one entry per (deviation_type, zone_id) pair
    const seenDevKeys = new Set<string>();
    deviations.forEach(d => {
      const devKey = `${d.deviation_type}|${d.zone_id || 'global'}`;
      if (seenDevKeys.has(devKey)) return; // skip duplicate
      seenDevKeys.add(devKey);

      const timeStr = new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isHigh = d.severity === 'high';
      const severityLabel = isHigh ? 'High' : 'Medium';
      // Build a human-readable worker/zone label
      // For PME entries, deviation_type is like "A. Suresh Kumar (CW001): Overdue Periodic Medical Examination"
      const devTypeParts = d.deviation_type.split(':');
      const workerPart = devTypeParts.length > 1 ? devTypeParts[0].trim() : d.deviation_type;
      const zoneName = CAMERA_MAP[d.zone_id || '']?.label || d.zone_id || 'Global';
      list.push({
        type: d.category === 'Confined Space' || d.deviation_type.includes('Area') ? 'Restricted Area Entry' : 'Compliance Gap',
        worker: `${workerPart} | ${zoneName}`,
        time: timeStr,
        severity: severityLabel,
        icon: AlertTriangle,
        iconBg: isHigh ? 'bg-red-500/20' : 'bg-[#eab308]/20',
        iconColor: isHigh ? 'text-red-400' : 'text-amber-400',
        badgeStyle: isHigh ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        timestampDate: new Date(d.timestamp),
      });
    });

    parsedRisks.forEach(r => {
      if (r.risk_level === 'critical' || r.risk_level === 'high') {
        const timeStr = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isCritical = r.risk_level === 'critical';
        list.push({
          type: isCritical ? 'Fall Detected' : 'High Risk Alert',
          worker: `Worker: Arun | Zone: ${r.zone_id}`,
          time: timeStr,
          severity: isCritical ? 'High' : 'Medium',
          icon: AlertCircle,
          iconBg: isCritical ? 'bg-red-500/20' : 'bg-amber-500/20',
          iconColor: isCritical ? 'text-red-400' : 'text-amber-400',
          badgeStyle: isCritical ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400',
          timestampDate: new Date(r.timestamp),
        });
      }
    });

    list.sort((a, b) => b.timestampDate.getTime() - a.timestampDate.getTime());

    if (list.length === 0) {
      return [
        {
          type: 'PPE Violation',
          worker: 'Worker: Raj | Assembly Line 2',
          time: '10:29 AM',
          severity: 'High',
          icon: ShieldAlert,
          iconBg: 'bg-red-500/20',
          iconColor: 'text-red-400',
          badgeStyle: 'border-red-500/30 bg-red-500/10 text-red-400',
          timestampDate: new Date()
        },
        {
          type: 'Restricted Area Entry',
          worker: 'Worker: Priya | Robot Zone',
          time: '10:24 AM',
          severity: 'High',
          icon: AlertTriangle,
          iconBg: 'bg-red-500/20',
          iconColor: 'text-red-400',
          badgeStyle: 'border-red-500/30 bg-red-500/10 text-red-400',
          timestampDate: new Date()
        },
        {
          type: 'Fall Detected',
          worker: 'Worker: Arun | Warehouse',
          time: '10:20 AM',
          severity: 'High',
          icon: AlertCircle,
          iconBg: 'bg-red-500/20',
          iconColor: 'text-red-400',
          badgeStyle: 'border-red-500/30 bg-red-500/10 text-red-400',
          timestampDate: new Date()
        },
        {
          type: 'Smoke Detected',
          worker: 'Location: Boiler Room',
          time: '10:18 AM',
          severity: 'Medium',
          icon: Flame,
          iconBg: 'bg-amber-500/20',
          iconColor: 'text-amber-400',
          badgeStyle: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
          timestampDate: new Date()
        },
        {
          type: 'PPE Compliance Restored',
          worker: 'Worker: Raj | Assembly Line 2',
          time: '10:17 AM',
          severity: 'Low',
          icon: ShieldCheck,
          iconBg: 'bg-emerald-500/20',
          iconColor: 'text-emerald-400',
          badgeStyle: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
          timestampDate: new Date()
        }
      ];
    }

    return list.slice(0, 5);
  }, [ppeViolations, deviations, parsedRisks]);

  // Dynamic Activity ticker feed mapping events
  const dynamicActivityTicker = useMemo(() => {
    const list: Array<{
      title: string;
      sub: string;
      time: string;
      icon: any;
      iconBg: string;
      iconColor: string;
      timestampDate: Date;
    }> = [];

    ppeViolations.forEach(v => {
      const isResolved = v.status === 'resolved';
      const timeStr = new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      list.push({
        title: isResolved ? 'PPE compliance restored' : 'PPE violation detected',
        sub: `Worker: ${v.worker_name || 'Unknown'}`,
        time: timeStr,
        icon: isResolved ? ShieldCheck : ShieldAlert,
        iconBg: isResolved ? 'bg-emerald-500/20' : 'bg-red-500/20',
        iconColor: isResolved ? 'text-emerald-400' : 'text-red-400',
        timestampDate: new Date(v.timestamp),
      });
    });

    // Deduplicate deviations in the activity ticker too
    const tickerSeenKeys = new Set<string>();
    deviations.forEach(d => {
      const devKey = `${d.deviation_type}|${d.zone_id || 'global'}`;
      if (tickerSeenKeys.has(devKey)) return;
      tickerSeenKeys.add(devKey);

      const timeStr = new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      // Extract just the deviation sub-type (after the colon if present)
      const devTypeParts = d.deviation_type.split(':');
      const subLabel = devTypeParts.length > 1 ? devTypeParts[1].trim() : d.deviation_type;
      list.push({
        title: d.category === 'Confined Space' || d.deviation_type.includes('Area') ? 'Restricted area entry' : 'Compliance warning',
        sub: subLabel.substring(0, 30),
        time: timeStr,
        icon: AlertTriangle,
        iconBg: d.severity === 'high' ? 'bg-red-500/20' : 'bg-amber-500/20',
        iconColor: d.severity === 'high' ? 'text-red-400' : 'text-amber-400',
        timestampDate: new Date(d.timestamp),
      });
    });

    if (list.length === 0) {
      return [
        {
          title: 'PPE compliance restored',
          sub: 'Worker: Raj',
          time: '10:17 AM',
          icon: ShieldCheck,
          iconBg: 'bg-emerald-500/20',
          iconColor: 'text-emerald-400'
        },
        {
          title: 'PPE violation detected',
          sub: 'Worker: Raj',
          time: '10:15 AM',
          icon: ShieldAlert,
          iconBg: 'bg-red-500/20',
          iconColor: 'text-red-400'
        },
        {
          title: 'Smoke detected',
          sub: 'Boiler Room',
          time: '10:18 AM',
          icon: Flame,
          iconBg: 'bg-amber-500/20',
          iconColor: 'text-amber-400'
        },
        {
          title: 'Restricted area entry',
          sub: 'Worker: Priya',
          time: '10:24 AM',
          icon: AlertTriangle,
          iconBg: 'bg-red-500/20',
          iconColor: 'text-red-400'
        },
        {
          title: 'Fall detected',
          sub: 'Worker: Arun',
          time: '10:20 AM',
          icon: AlertCircle,
          iconBg: 'bg-amber-500/20',
          iconColor: 'text-amber-400'
        }
      ];
    }

    list.sort((a, b) => b.timestampDate.getTime() - a.timestampDate.getTime());
    return list.slice(0, 5);
  }, [ppeViolations, deviations]);

  // Dynamic Alerts by Type Pie chart mapping actual counts
  const dynamicAlertsByTypeData = useMemo(() => {
    const ppeCount = ppeViolations.filter(v => v.status === 'open').length;
    const restrictedCount = deviations.filter(d => !d.resolved && (d.category === 'Confined Space' || d.deviation_type.includes('Area'))).length;
    const fallCount = parsedRisks.filter(r => r.risk_level === 'critical').length;
    const fireCount = gasThermalAlertsCount;

    const total = ppeCount + restrictedCount + fallCount + fireCount;
    if (total === 0) {
      return [
        { name: 'PPE Violation', value: 4, color: '#ef4444' },
        { name: 'Restricted Area', value: 2, color: '#f97316' },
        { name: 'Fall Detected', value: 1, color: '#a855f7' },
        { name: 'Smoke / Fire', value: 1, color: '#3b82f6' },
      ];
    }

    return [
      { name: 'PPE Violation', value: ppeCount, color: '#ef4444' },
      { name: 'Restricted Area', value: restrictedCount, color: '#f97316' },
      { name: 'Fall Detected', value: fallCount, color: '#a855f7' },
      { name: 'Smoke / Fire', value: fireCount, color: '#3b82f6' },
    ].filter(item => item.value > 0);
  }, [ppeViolations, deviations, parsedRisks, gasThermalAlertsCount]);

  const totalAlertsCount = useMemo(() => {
    return dynamicAlertsByTypeData.reduce((acc, curr) => acc + curr.value, 0);
  }, [dynamicAlertsByTypeData]);

  // Dynamic Risk Level Distribution Pie chart mapping actual counts
  const dynamicRiskDistributionData = useMemo(() => {
    const lowCount = parsedRisks.filter(r => r.risk_level === 'low').length;
    const medCount = parsedRisks.filter(r => r.risk_level === 'medium').length;
    const highCount = parsedRisks.filter(r => r.risk_level === 'high' || r.risk_level === 'critical').length;

    const total = lowCount + medCount + highCount;
    if (total === 0) {
      return [
        { name: 'Low Risk', value: 70, color: '#10b981' },
        { name: 'Medium Risk', value: 20, color: '#f59e0b' },
        { name: 'High Risk', value: 10, color: '#ef4444' },
      ];
    }

    return [
      { name: 'Low Risk', value: Math.round((lowCount / total) * 100), color: '#10b981' },
      { name: 'Medium Risk', value: Math.round((medCount / total) * 100), color: '#f59e0b' },
      { name: 'High Risk', value: Math.round((highCount / total) * 100), color: '#ef4444' },
    ];
  }, [parsedRisks]);

  return (
    <div id="dashboard-shell-container" className="flex flex-col gap-6 w-full">
      {/* 6 Stat Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Card 1: Total Workers */}
        <div className="card-soft-base bg-theme-card border border-theme-border p-4 flex flex-col gap-2 relative overflow-hidden group hover:border-emerald-500/50 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Users className="h-5 w-5" />
            </div>
            <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Active
            </span>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">Total Workers</p>
            <h3 className="text-3xl font-black font-mono tracking-tight text-theme-text mt-0.5">
              {totalWorkersCount}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-[9px] font-mono font-semibold text-theme-text-muted">
              <span className="text-emerald-500 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" /> +{totalWorkersDelta}
              </span>
              <span>Monitored Today</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
        </div>

        {/* Card 2: Safe Workers */}
        <div className="card-soft-base bg-theme-card border border-theme-border p-4 flex flex-col gap-2 relative overflow-hidden group hover:border-blue-500/50 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-black font-mono text-blue-400">
              {safeWorkersPercentage}%
            </span>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">Safe Workers</p>
            <h3 className="text-3xl font-black font-mono tracking-tight text-theme-text mt-0.5">
              {safeWorkersCount}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-[9px] font-mono font-semibold text-theme-text-muted">
              <span className="text-blue-500">PPE Verified</span>
              <span>on-shift</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
        </div>

        {/* Card 3: PPE Violations */}
        <div className="card-soft-base bg-theme-card border border-theme-border p-4 flex flex-col gap-2 relative overflow-hidden group hover:border-orange-500/50 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            {activePpeViolationsCount > 0 && (
              <span className="h-2 w-2 rounded-full bg-orange-500 animate-ping" />
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">PPE Violations</p>
            <h3 className="text-3xl font-black font-mono tracking-tight text-theme-text mt-0.5">
              {activePpeViolationsCount}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-[9px] font-mono font-semibold text-theme-text-muted">
              <span className="text-orange-500 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" /> +{ppeViolationsTodayCount}
              </span>
              <span>Live Detections</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-orange-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
        </div>

        {/* Card 4: Restricted Area Alerts */}
        <div className="card-soft-base bg-theme-card border border-theme-border p-4 flex flex-col gap-2 relative overflow-hidden group hover:border-red-500/50 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">Compliance Gaps</p>
            <h3 className="text-3xl font-black font-mono tracking-tight text-theme-text mt-0.5">
              {activeComplianceGapsCount}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-[9px] font-mono font-semibold text-theme-text-muted">
              <span className="text-red-500 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" /> +{complianceGapsTodayCount}
              </span>
              <span>Regulatory</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-red-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
        </div>

        {/* Card 5: Fire / Smoke Alerts */}
        <div className="card-soft-base bg-theme-card border border-theme-border p-4 flex flex-col gap-2 relative overflow-hidden group hover:border-purple-500/50 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Flame className="h-5 w-5" />
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">Fire / Smoke Alerts</p>
            <h3 className="text-3xl font-black font-mono tracking-tight text-theme-text mt-0.5">
              {gasThermalAlertsCount}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-[9px] font-mono font-semibold text-theme-text-muted">
              <span className="text-purple-500">↗ {gasThermalAlertsCount} Today</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
        </div>

        {/* Card 6: Critical Zones */}
        <div className="card-soft-base bg-theme-card border border-theme-border p-4 flex flex-col gap-2 relative overflow-hidden group hover:border-amber-500/50 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">Critical Zones</p>
            <h3 className="text-3xl font-black font-mono tracking-tight text-theme-text mt-0.5">
              {activeCriticalZonesCount}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-[9px] font-mono font-semibold text-theme-text-muted">
              <span>↗ {activeCriticalZonesCount} Active Now</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
        </div>
      </div>

      {/* Main Grid: Live Monitoring (Left) + Recent Alerts (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-stretch">
        {/* Column 1: Live Monitoring + Trend charts */}
        <div className="xl:col-span-3 flex flex-col gap-6">
          {/* CCTV Panel Card */}
          <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold tracking-tight text-theme-text uppercase flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Monitoring
              </h3>
              <a href="#live-monitoring" className="text-[10px] font-mono font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-all">
                View All Cameras <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>

            {/* 3-Camera Layout: CAM01 (Left ~60%), CAM02 & CAM03 stacked (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: CAM 01 (Live Laptop Webcam ~60% width) */}
              <div className="lg:col-span-7 xl:col-span-7">
                <LiveWebcamCameraTile
                  cameraId={cam01.id}
                  label={cam01.label}
                  zone={cam01.zone}
                  onSelectCamera={() => {
                    window.location.hash = '#live-monitoring';
                  }}
                />
              </div>

              {/* Right Column: Stacked Recorded Feeds (CAM 02 & CAM 03) */}
              <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-5">
                <RecordedFeedTile
                  camera={cam02}
                  onSelectCamera={() => {
                    window.location.hash = '#live-monitoring';
                  }}
                />
                <RecordedFeedTile
                  camera={cam03}
                  onSelectCamera={() => {
                    window.location.hash = '#live-monitoring';
                  }}
                />
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Chart 1: PPE Compliance Trend (AreaChart) */}
            <div className="md:col-span-5 bg-theme-card border border-theme-border rounded-3xl p-4 flex flex-col gap-3 min-h-[220px]">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">PPE Compliance Trend</h4>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[8px] font-mono font-black rounded-full">
                  98%
                </span>
              </div>
              <div className="flex-1 w-full h-[150px] mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={complianceTrendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="complianceColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={8} domain={[0, 100]} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '9px', color: '#fff' }} />
                    <Area type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#complianceColor)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Alerts by Type (PieChart) */}
            <div className="md:col-span-3 bg-theme-card border border-theme-border rounded-3xl p-4 flex flex-col gap-3 min-h-[220px]">
              <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Alerts by Type</h4>
              <div className="flex-1 flex items-center justify-between relative mt-1">
                <div className="w-[100px] h-[100px] relative shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dynamicAlertsByTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={40}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {dynamicAlertsByTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                    <span className="text-[7.5px] uppercase font-mono font-bold text-theme-text-muted">Total</span>
                    <span className="text-xs font-black text-theme-text leading-none mt-0.5">
                      {totalAlertsCount}
                    </span>
                  </div>
                </div>
                {/* Custom Legend */}
                <div className="flex flex-col gap-1.5 pl-2 overflow-hidden w-full">
                  {dynamicAlertsByTypeData.map(item => (
                    <div key={item.name} className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-[7.5px] font-mono font-extrabold text-theme-text-muted truncate w-14 uppercase">
                        {item.name}
                      </span>
                      <span className="text-[7.5px] font-mono font-black text-theme-text pl-0.5">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Chart 3: Risk Level Distribution (PieChart) */}
            <div className="md:col-span-4 bg-theme-card border border-theme-border rounded-3xl p-4 flex flex-col gap-3 min-h-[220px]">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Risk Level Distribution</h4>
                <button className="text-theme-text-secondary hover:text-theme-text transition-colors">
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 flex items-center justify-between relative mt-1">
                <div className="w-[100px] h-[100px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dynamicRiskDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={40}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {dynamicRiskDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Custom Legend */}
                <div className="flex flex-col gap-2 pl-2 overflow-hidden w-full">
                  {dynamicRiskDistributionData.map(item => (
                    <div key={item.name} className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-[7.5px] font-mono font-extrabold text-theme-text-muted truncate w-18 uppercase">
                        {item.name}
                      </span>
                      <span className="text-[7.5px] font-mono font-black text-theme-text pl-0.5">
                        {item.value}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Recent Alerts Panel */}
        <div className="xl:col-span-1 bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 min-h-[460px] self-stretch">
          <div className="flex items-center justify-between border-b border-theme-border pb-3">
            <h3 className="text-sm font-extrabold tracking-tight text-theme-text uppercase">Recent Alerts</h3>
            <button
              onClick={onViewAllAlerts}
              className="text-[10px] font-mono font-bold text-theme-text-secondary hover:text-theme-text flex items-center gap-0.5 transition-all bg-transparent border-0 cursor-pointer"
            >
              View All <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px]">
            {dynamicRecentAlerts.map((alert, idx) => (
              <div key={idx} className="flex items-start justify-between p-3 rounded-2xl bg-theme-bg-alt border border-theme-border hover:border-theme-border-hover transition-all gap-2 group">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${alert.iconBg} ${alert.iconColor}`}>
                    <alert.icon className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="text-[11px] font-extrabold text-theme-text uppercase tracking-wide truncate">
                      {alert.type}
                    </span>
                    <span className="text-[9px] text-theme-text-secondary truncate mt-1">
                      {alert.worker}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0 text-right">
                  <span className="text-[8px] font-mono font-semibold text-theme-text-muted">{alert.time}</span>
                  <span className={`text-[8px] font-mono font-black px-2 py-0.5 rounded-full border uppercase ${alert.badgeStyle}`}>
                    {alert.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Activity Ticker */}
      <div className="bg-theme-card border border-theme-border rounded-3xl p-4 flex flex-col gap-3">
        <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted flex items-center gap-2">
          <Activity className="h-4.5 w-4.5 text-emerald-400 animate-pulse" />
          Recent Activity
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 mt-1">
          {dynamicActivityTicker.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-theme-well border border-theme-border hover:bg-theme-card-hover transition-all">
              <div className={`p-1.5 rounded-lg shrink-0 ${item.iconBg} ${item.iconColor}`}>
                <item.icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col leading-none min-w-0">
                <span className="text-[10px] font-extrabold text-theme-text truncate max-w-full uppercase">{item.title}</span>
                <span className="text-[8px] font-mono text-theme-text-muted mt-1">{item.sub} | {item.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Sidebar widget wrapper for the Overall Safety Score Gauge
export function OverallSafetyScoreWidget({ score, label, color }: { score: number; label: string; color: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="bg-slate-900/50 dark:bg-slate-950/40 border border-slate-800/80 dark:border-slate-800/60 p-4 rounded-3xl flex flex-col items-center gap-3 w-full shadow-inner">
      <h4 className="text-[10px] font-extrabold tracking-widest text-slate-400 uppercase">Overall Safety Score</h4>
      
      {/* SVG Radial Gauge */}
      <div className="relative h-28 w-28 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="transparent"
            stroke="rgba(30, 41, 59, 0.5)"
            strokeWidth="8"
          />
          {/* Animated fill circle */}
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="transparent"
            stroke="url(#gaugeGradient)"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
          {/* Gradient definition */}
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="60%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
          </defs>
        </svg>
        {/* Score label text in center */}
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-2xl font-black font-mono text-white leading-none">{score}%</span>
        </div>
      </div>

      <div className="text-center">
        <span className={`text-[11px] font-extrabold tracking-wider uppercase ${color}`}>
          {label}
        </span>
      </div>
    </div>
  );
}
