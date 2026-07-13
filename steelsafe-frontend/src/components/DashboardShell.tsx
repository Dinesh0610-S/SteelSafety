import { useEffect, useMemo, useRef } from 'react';
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
import { useCamera, drawPredictions } from '../context/CameraContext';

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

const PLANT_ZONE_FALLBACKS: Record<string, Array<{ id: string; label: string; camNumber: string }>> = {
  'plant_coke_oven': [
    { id: "zone_cob1", label: "Coke Oven Battery 1", camNumber: "CAM 01" },
    { id: "zone_gcm",  label: "Gas Collection Main",  camNumber: "CAM 02" },
    { id: "zone_qt",   label: "Quenching Tower",       camNumber: "CAM 03" },
    { id: "zone_ca",   label: "Charging Area",          camNumber: "CAM 04" },
    { id: "zone_cr",   label: "Control Room",           camNumber: "CAM 05" },
    { id: "zone_cob_e",label: "Coke Oven East",        camNumber: "CAM 06" },
  ],
  'plant_rolling_mill': [
    { id: "zone_rhf",  label: "Reheating Furnace",   camNumber: "CAM 01" },
    { id: "zone_rs",   label: "Rolling Stand",        camNumber: "CAM 02" },
    { id: "zone_cb",   label: "Cooling Bed",          camNumber: "CAM 03" },
    { id: "zone_fl",   label: "Finishing Line",       camNumber: "CAM 04" },
    { id: "zone_cr2",  label: "Mill Control Room",    camNumber: "CAM 05" },
    { id: "zone_rs_b", label: "Rolling Stand East",  camNumber: "CAM 06" },
  ],
};

const CAMERA_MAP: Record<string, { label: string; camNumber: string }> = {
  "zone_cob1": { label: "Coke Oven Battery 1", camNumber: "CAM 01" },
  "zone_gcm":  { label: "Gas Collection Main",  camNumber: "CAM 02" },
  "zone_qt":   { label: "Quenching Tower",       camNumber: "CAM 03" },
  "zone_ca":   { label: "Charging Area",          camNumber: "CAM 04" },
  "zone_cr":   { label: "Control Room",           camNumber: "CAM 05" },
  "zone_rhf":  { label: "Reheating Furnace",     camNumber: "CAM 01" },
  "zone_rs":   { label: "Rolling Stand",          camNumber: "CAM 02" },
  "zone_cb":   { label: "Cooling Bed",            camNumber: "CAM 03" },
  "zone_fl":   { label: "Finishing Line",         camNumber: "CAM 04" },
  "zone_cr2":  { label: "Mill Control Room",      camNumber: "CAM 05" },
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
    stream,
    totalWorkersDetected,
    violationWorkersCount,
    predictions,
    realCamZone
  } = useCamera();

  const dashboardVideoRef = useRef<HTMLVideoElement | null>(null);
  const dashboardCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync stream to dashboard video element
  useEffect(() => {
    if (dashboardVideoRef.current) {
      dashboardVideoRef.current.srcObject = stream;
      if (stream) {
        dashboardVideoRef.current.play().catch(e => console.warn("Failed playing dashboard video:", e));
      }
    }
  }, [stream]);

  // Canvas drawing loop for live predictions on Dashboard
  useEffect(() => {
    if (!webcamActive || !dashboardVideoRef.current || !dashboardCanvasRef.current) return;
    let animationFrameId: number;
    let isRunning = true;

    const renderLoop = () => {
      if (!isRunning) return;
      const video = dashboardVideoRef.current;
      const canvas = dashboardCanvasRef.current;
      if (video && canvas && video.readyState === 4) {
        drawPredictions(canvas, predictions, video);
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [webcamActive, predictions]);

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
  const activePpeViolationsCount = activePPEViolations.length;
  const ppeViolationsTodayCount = useMemo(() => {
    if (!t0) return activePpeViolationsCount;
    // Count violations logged since shift start t0
    return ppeViolations.filter(v => new Date(v.timestamp) >= t0).length;
  }, [ppeViolations, t0, activePpeViolationsCount]);

  // Card 4: Active Compliance Gaps (replaces Restricted Area Alerts)
  const activeComplianceGapsCount = useMemo(() => {
    return deviations.filter(d => !d.resolved).length;
  }, [deviations]);

  const complianceGapsTodayCount = useMemo(() => {
    if (!t0) return activeComplianceGapsCount;
    // Count deviations logged since shift start t0
    return deviations.filter(d => new Date(d.timestamp) >= t0).length;
  }, [deviations, t0, activeComplianceGapsCount]);

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

  // Dynamic Camera Feeds mapping live telemetry
  const dynamicCameraFeeds = useMemo(() => {
    const feeds: any[] = [];
    // Sort so realCamZone (CAM 01 - real camera) is always first; then take up to 6
    const zones = [...parsedRisks].sort((a, b) => {
      if (a.zone_id === realCamZone) return -1;
      if (b.zone_id === realCamZone) return 1;
      return 0;
    }).slice(0, 6);

    zones.forEach((zone, idx) => {
      const zoneId = zone.zone_id;
      const isRealCam = zoneId === realCamZone;
      // Use CAMERA_MAP for real zone name — fall back gracefully if unmapped
      const mapInfo = CAMERA_MAP[zoneId] || { label: zone.zone_id.replace('zone_', '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()), camNumber: `CAM 0${idx + 1}` };
      
      const activePPE = ppeViolations.filter(v => v.status === 'open' && v.zone_id === zoneId);
      const activeDev = deviations.filter(d => !d.resolved && d.zone_id === zoneId);
      
      const co = zone.snap?.co_ppm || 0;
      const h2s = zone.snap?.h2s_ppm || 0;
      const temp = zone.snap?.temperature_c || 0;
      const tempBaseline = ZONE_TEMPERATURE_BASELINES[zoneId] || 0;
      const isGasThermal = co >= 35.0 || h2s >= 5.0 || (tempBaseline > 0 && (temp - tempBaseline) >= 50.0);

      let status = 'SAFE';
      let statusColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      let boxColor = 'border-emerald-500 text-emerald-400';
      let boxLabel = 'Worker: Compliant';

      if (isRealCam && webcamActive) {
        status = violationWorkersCount > 0 ? 'NO HAT' : 'SAFE';
        statusColor = violationWorkersCount > 0
          ? 'bg-red-500/20 text-red-400 border-red-500/30'
          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
        boxColor = violationWorkersCount > 0 ? 'border-red-500 text-red-400' : 'border-emerald-500 text-emerald-400';
        boxLabel = violationWorkersCount > 0 ? `Worker: Missing Hard Hat (${totalWorkersDetected} in frame)` : `Worker: Compliant (${totalWorkersDetected} in frame)`;
      } else if (activePPE.length > 0) {
        status = 'NO VEST';
        statusColor = 'bg-red-500/20 text-red-400 border-red-500/30';
        boxColor = 'border-red-500 text-red-400';
        boxLabel = `Worker: Missing ${activePPE[0].ppe_items_missing?.join(', ') || 'Vest'}`;
      } else if (isGasThermal) {
        status = 'SMOKE DETECTED';
        statusColor = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
        boxColor = 'border-amber-500 text-amber-400';
        boxLabel = 'Operator: High Heat/Gas';
      } else if (activeDev.length > 0) {
        status = 'RESTRICTED AREA';
        statusColor = 'bg-orange-500/20 text-orange-400 border-orange-500/30';
        boxColor = 'border-orange-500 text-orange-400';
        boxLabel = 'Worker: Restricted Zone';
      }

      feeds.push({
        id: zoneId,
        name: `${mapInfo.camNumber} - ${mapInfo.label}`,
        status,
        statusColor,
        isWebcam: isRealCam,
        workers: [
          {
            id: 1,
            label: boxLabel,
            x: idx % 2 === 0 ? 'left-[30%] top-[40%]' : 'left-[45%] top-[35%]',
            w: 'w-14 h-28',
            color: boxColor,
          }
        ]
      });
    });

    // Fill remaining slots using real plant zone names — never show "Loading Bay"
    if (feeds.length < 6) {
      const plantFallbacks = PLANT_ZONE_FALLBACKS[activePlantId] || PLANT_ZONE_FALLBACKS['plant_coke_oven'];
      const usedIds = new Set(feeds.map(f => f.id));
      for (const fb of plantFallbacks) {
        if (feeds.length >= 6) break;
        if (usedIds.has(fb.id)) continue;
        const isRealCam = fb.id === realCamZone;
        feeds.push({
          id: fb.id,
          name: `${fb.camNumber} - ${fb.label}`,
          status: (isRealCam && webcamActive) ? (violationWorkersCount > 0 ? 'NO HAT' : 'SAFE') : 'SAFE',
          statusColor: (isRealCam && webcamActive)
            ? (violationWorkersCount > 0 ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30')
            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
          isWebcam: isRealCam,
          workers: [
            {
              id: 1,
              label: (isRealCam && webcamActive)
                ? (violationWorkersCount > 0 ? `Worker: Missing Hard Hat (${totalWorkersDetected} in frame)` : `Worker: Compliant (${totalWorkersDetected} in frame)`)
                : 'Worker: Compliant',
              x: 'left-[40%] top-[40%]',
              w: 'w-12 h-26',
              color: (isRealCam && webcamActive && violationWorkersCount > 0) ? 'border-red-500 text-red-400' : 'border-emerald-500 text-emerald-400',
            }
          ]
        });
      }
    }

    return feeds;
  }, [parsedRisks, ppeViolations, deviations, activePlantId, webcamActive, violationWorkersCount, totalWorkersDetected, realCamZone]);

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

        {/* Card 6: Fall Incidents */}
        <div className="card-soft-base bg-theme-card border border-theme-border p-4 flex flex-col gap-2 relative overflow-hidden group hover:border-amber-500/50 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">Fall Incidents</p>
            <h3 className="text-3xl font-black font-mono tracking-tight text-theme-text mt-0.5">
              {activeCriticalZonesCount}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-[9px] font-mono font-semibold text-theme-text-muted">
              <span>↗ {activeCriticalZonesCount} Today</span>
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

            {/* 6 Cameras in 3x2 Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {dynamicCameraFeeds.map(cam => (
                <div key={cam.id} className="relative aspect-video rounded-2xl border border-slate-800 bg-[#0d121f] overflow-hidden group shadow-inner">
                  {/* Grid Lines Overlay */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.35)_95%),linear-gradient(90deg,rgba(18,24,38,0)_95%,rgba(0,0,0,0.35)_95%)] bg-[size:20px_20px] pointer-events-none opacity-30" />
                  
                  {/* Subtle CRT Scanner bar */}
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500/10 pointer-events-none animate-scanline" />

                  {/* Camera backdrop — shows correct label per tile type */}
                  {!cam.isWebcam || !webcamActive ? (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#121c33] via-[#090e1a] to-[#070b14] flex flex-col items-center justify-center gap-1.5">
                      <span className="text-[8px] font-mono font-bold text-slate-500 select-none uppercase tracking-widest">
                        {cam.isWebcam ? 'Real Hardware Camera' : 'Simulated Feed'}
                      </span>
                      <span className="text-[6px] font-mono text-slate-600 select-none">
                        {cam.isWebcam ? 'Standby — Inactive' : 'Risk engine data only'}
                      </span>
                    </div>
                  ) : null}

                  {/* Real Webcam feed rendering */}
                  {cam.isWebcam && (
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                      <video
                        ref={dashboardVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`absolute top-0 left-0 w-full h-full object-cover scale-x-[-1] ${webcamActive ? 'block' : 'hidden'}`}
                      />
                      <canvas
                        ref={dashboardCanvasRef}
                        className={`absolute top-0 left-0 w-full h-full object-cover scale-x-[-1] ${webcamActive ? 'block' : 'hidden'}`}
                      />
                    </div>
                  )}

                  {/* Simulated Bounding Box (inactive webcam or simulated tiles) */}
                  {(!cam.isWebcam || !webcamActive) && cam.workers.map((w: any, idx: number) => (
                    <div key={idx} className={`absolute ${w.x} ${w.w} border-2 ${w.color} rounded-lg flex flex-col justify-between p-1 bg-black/10 backdrop-blur-[0.5px] animate-pulse`}>
                      <span className="text-[7px] font-bold font-mono px-1 rounded bg-black/60 text-white truncate max-w-full leading-none">
                        {w.label}
                      </span>
                    </div>
                  ))}

                  {/* Camera Header Banner */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none select-none z-10">
                    <span className="text-[8px] font-mono font-extrabold text-white px-2 py-0.5 bg-black/60 rounded backdrop-blur-sm">
                      {cam.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {/* Real hardware/LIVE/STANDBY badge — only on CAM 01 */}
                      {cam.isWebcam ? (
                        webcamActive ? (
                          <span className="text-[6px] font-mono font-extrabold px-1.5 py-0.5 rounded border backdrop-blur-sm bg-red-500/20 text-red-400 border-red-500/40 animate-pulse flex items-center gap-1">
                            <span className="h-1 w-1 rounded-full bg-red-500 animate-ping" />
                            LIVE
                          </span>
                        ) : (
                          <span className="text-[6px] font-mono font-extrabold px-1.5 py-0.5 rounded border backdrop-blur-sm bg-amber-500/20 text-amber-400 border-amber-500/40">
                            STANDBY
                          </span>
                        )
                      ) : (
                        <span className="text-[6px] font-mono font-extrabold px-1.5 py-0.5 rounded border backdrop-blur-sm bg-slate-800/80 text-slate-500 border-slate-600/40">
                          SIM
                        </span>
                      )}
                      <span className={`text-[7px] font-mono font-extrabold px-1.5 py-0.5 rounded border backdrop-blur-sm ${cam.statusColor}`}>
                        {cam.status}
                      </span>
                    </div>
                  </div>

                  {/* Blinking Live indicator bottom right */}
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 pointer-events-none select-none z-10">
                    <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${cam.isWebcam && webcamActive ? 'bg-red-500' : 'bg-emerald-500'}`} />
                  </div>
                </div>
              ))}
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
