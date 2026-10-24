import { useState, useMemo, useEffect } from 'react';
import {
  ShieldAlert, RefreshCw, Search, ChevronDown, Download, Flame, AlertCircle, ShieldCheck
} from 'lucide-react';
import type { PPEViolationEvent } from './CCTVPanel';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell
} from 'recharts';

interface MainOfficePanelProps {
  violations: PPEViolationEvent[];
  deviations: ComplianceDeviation[];
  onAcknowledge: (id: number) => Promise<void>;
  onResolve: (id: any, source: string) => Promise<void>;
  onRefresh: () => void;
  onSelectAlert?: (alert: any) => void;
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

const CAMERA_MAP: Record<string, string> = {
  "CAM01": "CAM 01",
  "CAM02": "CAM 02",
  "CAM03": "CAM 03",
  "zone_cob1": "CAM 01",
  "zone_ca": "CAM 02",
  "zone_gcm": "CAM 03",
};

const ZONE_NAME_MAP: Record<string, string> = {
  "CAM01": "Coke Oven Battery",
  "CAM02": "Blast Furnace Zone",
  "CAM03": "Gas Cleaning Plant",
  "zone_cob1": "Coke Oven Battery",
  "zone_ca": "Blast Furnace Zone",
  "zone_gcm": "Gas Cleaning Plant",
};

export function MainOfficePanel({
  violations,
  onAcknowledge,
  onResolve,
  onRefresh,
  onSelectAlert
}: MainOfficePanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('All');
  const [selectedDateFilter, setSelectedDateFilter] = useState('All');
  const [selectedZone, setSelectedZone] = useState('All');
  const [selectedCamera, setSelectedCamera] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  // Selected Alert Modal Detail state
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setErrorMessage(null);
  }, [selectedAlert]);



  // Combine PPE violations and compliance deviations into a single alert log
  const combinedAlerts = useMemo(() => {
    const list: any[] = [];

    violations.forEach(v => {
      let severity = 'High';
      if (v.risk_score_at_time && v.risk_score_at_time >= 90) severity = 'Critical';
      else if (v.risk_score_at_time && v.risk_score_at_time < 40) severity = 'Low';
      else if (v.risk_score_at_time && v.risk_score_at_time < 70) severity = 'Medium';

      const zoneName = ZONE_NAME_MAP[v.zone_id] || v.zone_name || 'Assembly Line';
      const camLabel = CAMERA_MAP[v.zone_id] || 'CAM 02';

      const formatPpeItemName = (item: string) => {
        if (item === 'hard_hat' || item === 'helmet') return 'Helmet';
        if (item === 'safety_vest' || item === 'vest') return 'Safety Vest';
        if (item === 'safety_shoes' || item === 'shoes') return 'Safety Shoes (beta)';
        if (item === 'gloves') return 'Gloves (beta)';
        if (item === 'mask') return 'Mask (beta)';
        return item.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      };

      const missingItems = v.ppe_items_missing || [];
      const formattedItems = missingItems.map(formatPpeItemName);
      const alertType = formattedItems.length > 0 ? `Missing: ${formattedItems.join(', ')}` : 'PPE Violation';
      const description = `Worker detected in ${zoneName} without ${formattedItems.length > 0 ? formattedItems.join(', ') : 'proper PPE'}.`;
      const actionRecommended = `Verify PPE compliance (${formattedItems.length > 0 ? formattedItems.join(', ') : 'required items'}) on CCTV and contact supervisor.`;

      // Extract worker name if index is embedded in zone_name (e.g. "Worker #1")
      let workerName = (v as any).worker_name || 'Raj';
      const match = v.zone_name.match(/Worker #(\d+)/);
      if (match) {
        const workerIndex = parseInt(match[1]);
        const names = ['Raj', 'Priya', 'Arun', 'Karan', 'Mohan'];
        if (workerIndex >= 1 && workerIndex <= names.length) {
          workerName = names[workerIndex - 1];
        } else {
          workerName = `Worker #${workerIndex}`;
        }
      }

      list.push({
        id: `ppe_${v.id}`,
        rawId: v.id,
        source: 'ppe',
        time: new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestampDate: new Date(v.timestamp),
        alertType,
        worker: workerName,
        zone: zoneName,
        zoneId: v.zone_id,
        camera: camLabel,
        severity,
        status: v.status === 'resolved' ? 'Resolved' : 'Open',
        statusRaw: v.status,
        description,
        actionRecommended
      });
    });

    list.sort((a, b) => b.timestampDate.getTime() - a.timestampDate.getTime());
    return list;
  }, [violations]);

  // Apply filters
  const filteredAlerts = useMemo(() => {
    return combinedAlerts.filter(alert => {
      const matchesSearch = alert.alertType.toLowerCase().includes(searchQuery.toLowerCase())
        || alert.worker.toLowerCase().includes(searchQuery.toLowerCase())
        || alert.zone.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSeverity = selectedSeverity === 'All' || alert.severity === selectedSeverity;
      
      const matchesZone = selectedZone === 'All' || alert.zone === selectedZone;

      const matchesCamera = selectedCamera === 'All' || alert.camera === selectedCamera;

      const matchesStatus = selectedStatus === 'All' || alert.status === selectedStatus;

      // Date range filter
      let matchesDate = true;
      if (selectedDateFilter === 'Today') {
        const today = new Date().toDateString();
        matchesDate = alert.timestampDate.toDateString() === today;
      }

      return matchesSearch && matchesSeverity && matchesZone && matchesCamera && matchesStatus && matchesDate;
    });
  }, [combinedAlerts, searchQuery, selectedSeverity, selectedZone, selectedCamera, selectedStatus, selectedDateFilter]);

  // Extract unique filter dropdown values
  const uniqueZones = useMemo(() => {
    const set = new Set<string>();
    combinedAlerts.forEach(a => set.add(a.zone));
    return Array.from(set);
  }, [combinedAlerts]);

  const uniqueCameras = useMemo(() => {
    const set = new Set<string>();
    combinedAlerts.forEach(a => set.add(a.camera));
    return Array.from(set);
  }, [combinedAlerts]);

  // Bottom-Left chart: Alerts Over Time
  const alertsOverTimeData = useMemo(() => {
    // Generate dates for past 6 days + today
    const dataList: any[] = [];
    const dateNames = ['06 Jul', '07 Jul', '08 Jul', '09 Jul', '10 Jul', '11 Jul', '12 Jul'];
    
    dateNames.forEach((dName, dayIdx) => {
      const dayData = { date: dName, Critical: 0, High: 0, Medium: 0, Low: 0 };
      
      // Seed realistic base counts
      if (dayIdx === 0) { dayData.Critical = 2; dayData.High = 4; dayData.Medium = 3; dayData.Low = 6; }
      else if (dayIdx === 1) { dayData.Critical = 1; dayData.High = 5; dayData.Medium = 4; dayData.Low = 8; }
      else if (dayIdx === 2) { dayData.Critical = 3; dayData.High = 3; dayData.Medium = 5; dayData.Low = 5; }
      else if (dayIdx === 3) { dayData.Critical = 1; dayData.High = 6; dayData.Medium = 2; dayData.Low = 7; }
      else if (dayIdx === 4) { dayData.Critical = 2; dayData.High = 4; dayData.Medium = 4; dayData.Low = 9; }
      else if (dayIdx === 5) { dayData.Critical = 4; dayData.High = 5; dayData.Medium = 3; dayData.Low = 6; }
      else {
        // Today - calculate dynamic counts
        filteredAlerts.forEach(alert => {
          if (alert.severity === 'Critical') dayData.Critical++;
          else if (alert.severity === 'High') dayData.High++;
          else if (alert.severity === 'Medium') dayData.Medium++;
          else if (alert.severity === 'Low') dayData.Low++;
        });
      }
      dataList.push(dayData);
    });

    return dataList;
  }, [filteredAlerts]);

  // Bottom-Middle: Top Violations Donut
  const topViolationsData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAlerts.forEach(alert => {
      counts[alert.alertType] = (counts[alert.alertType] || 0) + 1;
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    const colors = ['#ef4444', '#f97316', '#a855f7', '#3b82f6', '#10b981'];
    
    return sorted.map(([name, val], idx) => {
      const pct = total > 0 ? Math.round((val / total) * 100) : 0;
      return {
        name,
        value: val,
        percentage: pct,
        color: colors[idx % colors.length]
      };
    });
  }, [filteredAlerts]);

  const totalViolationsCount = useMemo(() => {
    return topViolationsData.reduce((acc, curr) => acc + curr.value, 0);
  }, [topViolationsData]);

  // Bottom-Right: Alert Heatmap (Time-of-day vs Zone Intensity)
  const heatmapData = useMemo(() => {
    const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'];
    const zones = ['Entrance', 'Mill Entry', 'Boiler', 'Assembly', 'Warehouse'];

    // Generate grid density matrix
    const grid: number[][] = Array(zones.length).fill(0).map(() => Array(hours.length).fill(0));

    // Seed realistic base alert distributions
    grid[0][1] = 1; grid[0][3] = 2;
    grid[1][2] = 2; grid[1][4] = 1;
    grid[2][3] = 3; grid[2][5] = 1;
    grid[3][2] = 1; grid[3][3] = 2; grid[3][4] = 3;
    grid[4][1] = 1; grid[4][5] = 2;

    // Apply live dynamic alert timestamps to grid mapping
    filteredAlerts.forEach(alert => {
      const hr = alert.timestampDate.getHours();
      const hrIdx = Math.min(hours.length - 1, Math.floor(hr / 4));
      
      // Determine zone index
      let zIdx = 3; // default Assembly
      if (alert.zone.toLowerCase().includes('entrance')) zIdx = 0;
      else if (alert.zone.toLowerCase().includes('entry') || alert.zone.toLowerCase().includes('stand')) zIdx = 1;
      else if (alert.zone.toLowerCase().includes('boiler') || alert.zone.toLowerCase().includes('control')) zIdx = 2;
      else if (alert.zone.toLowerCase().includes('warehouse')) zIdx = 4;

      grid[zIdx][hrIdx]++;
    });

    return { hours, zones, grid };
  }, [filteredAlerts]);

  // Modal actions
  const handleAcknowledgeAlert = async () => {
    if (!selectedAlert) return;
    setActionInProgress(true);
    try {
      if (selectedAlert.source === 'ppe') {
        await onAcknowledge(selectedAlert.rawId);
      } else if (selectedAlert.source === 'deviation') {
        // deviation acknowledge
      }
      // Update panel status in-place — do NOT close panel so user sees confirmation
      setSelectedAlert((prev: any) => prev ? { ...prev, status: 'Acknowledged', statusRaw: 'acknowledged' } : null);
      onRefresh();
    } catch (err) {
      console.warn("Failed to acknowledge alert:", err);
    } finally {
      setActionInProgress(false);
      // Note: intentionally NOT calling setSelectedAlert(null) here
    }
  };

  const handleResolveAlert = async () => {
    if (!selectedAlert) return;
    setActionInProgress(true);
    setErrorMessage(null);
    try {
      await onResolve(selectedAlert.rawId || selectedAlert.id, selectedAlert.source);
      // Update panel status in-place — keep panel open so user sees 'Resolved' confirmation
      setSelectedAlert((prev: any) => prev ? { ...prev, status: 'Resolved', statusRaw: 'resolved' } : null);
      onRefresh();
    } catch (err: any) {
      console.warn("Failed to resolve alert:", err);
      setErrorMessage(err.message || 'Failed to resolve safety alert. Please try again.');
    } finally {
      setActionInProgress(false);
    }
  };

  // CSV Export utility
  const handleExportCSV = () => {
    const headers = ['Time', 'Alert Type', 'Worker', 'Zone', 'Camera', 'Severity', 'Status', 'Description'];
    const rows = filteredAlerts.map(a => [
      a.time,
      a.alertType,
      a.worker,
      a.zone,
      a.camera,
      a.severity,
      a.status,
      a.description.replace(/,/g, ';')
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `steelsafe_alerts_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="alerts-page-container" className="flex flex-col gap-6 w-full text-theme-text">
      
      {/* Header controls matching mockup */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col leading-tight">
          <h2 className="text-xl font-black tracking-tight text-theme-text m-0">2. ALERTS</h2>
          <p className="text-[11px] text-theme-text-muted font-bold mt-1.5">All safety alerts detected by AI System</p>
        </div>

        {/* Dropdowns Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-theme-card border border-theme-border p-3 rounded-2xl">
          <div className="flex flex-wrap items-center gap-3">
            {/* Severity filter */}
            <div className="relative">
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="bg-theme-bg border border-theme-border px-3 py-1.5 pr-8 rounded-xl text-xs text-theme-text font-bold focus:outline-none appearance-none cursor-pointer"
              >
                <option value="All">All Severity</option>
                <option value="Critical">🔴 Critical</option>
                <option value="High">🟠 High</option>
                <option value="Medium">🟡 Medium</option>
                <option value="Low">🟢 Low</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-3 w-3 text-slate-500 pointer-events-none" />
            </div>

            {/* Date range filter */}
            <div className="relative">
              <select
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value)}
                className="bg-theme-bg border border-theme-border px-3 py-1.5 pr-8 rounded-xl text-xs text-theme-text font-bold focus:outline-none appearance-none cursor-pointer"
              >
                <option value="All">All Dates</option>
                <option value="Today">Today</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-3 w-3 text-slate-500 pointer-events-none" />
            </div>

            {/* Zones filter */}
            <div className="relative">
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="bg-theme-bg border border-theme-border px-3 py-1.5 pr-8 rounded-xl text-xs text-theme-text font-bold focus:outline-none appearance-none cursor-pointer"
              >
                <option value="All">All Zones</option>
                {uniqueZones.map(z => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-3 w-3 text-slate-500 pointer-events-none" />
            </div>

            {/* Cameras filter */}
            <div className="relative">
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="bg-theme-bg border border-theme-border px-3 py-1.5 pr-8 rounded-xl text-xs text-theme-text font-bold focus:outline-none appearance-none cursor-pointer"
              >
                <option value="All">All Cameras</option>
                {uniqueCameras.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-3 w-3 text-slate-500 pointer-events-none" />
            </div>

            {/* Status filter */}
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-theme-bg border border-theme-border px-3 py-1.5 pr-8 rounded-xl text-xs text-theme-text font-bold focus:outline-none appearance-none cursor-pointer"
              >
                <option value="All">All Status</option>
                <option value="Open">Open</option>
                <option value="Resolved">Resolved</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-3 w-3 text-slate-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search alerts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-theme-bg border border-theme-border pl-9 pr-4 py-1.5 rounded-xl text-xs text-theme-text placeholder-theme-text-muted focus:outline-none focus:border-emerald-500 w-44 font-semibold shadow-inner"
              />
            </div>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#10b981]/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Database Table layout */}
      <div className="bg-theme-card border border-theme-border rounded-3xl overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-theme-border bg-theme-bg-alt text-theme-text-muted text-[10px] font-extrabold uppercase tracking-wider">
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4">Alert</th>
                <th className="px-6 py-4">Worker</th>
                <th className="px-6 py-4">Zone</th>
                <th className="px-6 py-4">Camera</th>
                <th className="px-6 py-4 text-center">Severity</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-theme-text-muted font-mono text-[9px] font-black uppercase tracking-widest bg-theme-bg/10">
                    🛡️ No safety violations detected by active cameras
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-theme-bg-alt/40 transition-colors text-xs font-semibold text-theme-text">
                    <td className="px-6 py-4 font-mono font-bold text-theme-text-muted">{alert.time}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`p-1.5 rounded-lg ${
                          alert.severity === 'Critical' || alert.severity === 'High' ? 'bg-red-500/10 text-red-400' :
                          alert.severity === 'Medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {alert.alertType.includes('Helmet') || alert.alertType.includes('Vest') ? <ShieldAlert className="h-3.5 w-3.5" /> :
                           alert.alertType.includes('Smoke') || alert.alertType.includes('Fire') ? <Flame className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        </span>
                        <span>{alert.alertType}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-theme-text-secondary font-bold">{alert.worker}</td>
                    <td className="px-6 py-4 text-theme-text-secondary">{alert.zone}</td>
                    <td className="px-6 py-4 font-mono text-theme-text-muted">{alert.camera}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full border text-[9px] font-black font-mono uppercase ${
                        alert.severity === 'Critical' ? 'bg-red-500/10 border-red-500/30 text-red-500 animate-pulse' :
                        alert.severity === 'High' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                        alert.severity === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                        'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      }`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black font-mono uppercase ${
                        alert.status === 'Open' ? 'bg-red-500/10 border border-red-500/20 text-red-400 animate-pulse' :
                        'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      }`}>
                        {alert.status === 'Open' && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                        {alert.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => {
                          if (onSelectAlert) {
                            onSelectAlert(alert);
                          } else {
                            setSelectedAlert(alert);
                          }
                        }}
                        className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                          alert.status === 'Open' 
                            ? 'bg-theme-bg hover:bg-theme-card-hover border-theme-border text-theme-text-secondary hover:text-theme-text' 
                            : 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                      >
                        {alert.status === 'Open' ? 'View' : 'Details'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        
        {/* Chart 1: Alerts Over Time */}
        <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Alerts Over Time</h3>
          <div className="flex-1 w-full h-[160px] mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={alertsOverTimeData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '9px', color: '#fff' }} />
                <Area type="monotone" dataKey="Critical" stroke="#ef4444" fillOpacity={1} fill="url(#colorCritical)" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="High" stroke="#f97316" fill="transparent" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="Medium" stroke="#eab308" fill="transparent" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Top Violations Donut */}
        <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Top Violations</h3>
          <div className="flex-1 flex items-center justify-between relative mt-1">
            <div className="w-[110px] h-[110px] relative shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topViolationsData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={45}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {topViolationsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                <span className="text-[7.5px] uppercase font-mono font-bold text-theme-text-muted">Total</span>
                <span className="text-sm font-black text-theme-text leading-none mt-0.5">{totalViolationsCount}</span>
              </div>
            </div>
            {/* Custom Legend */}
            <div className="flex flex-col gap-1.5 pl-2 overflow-hidden w-full">
              {topViolationsData.map(item => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[7.5px] font-mono font-extrabold text-theme-text-muted truncate w-20 uppercase">
                    {item.name}
                  </span>
                  <span className="text-[7.5px] font-mono font-black text-theme-text pl-0.5">
                    {item.value} ({item.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 3: Alert Heatmap */}
        <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Alert Heatmap</h3>
          
          <div className="flex-1 flex flex-col gap-2 mt-1 select-none">
            {heatmapData.zones.map((zone, zIdx) => (
              <div key={zone} className="flex items-center gap-2">
                {/* Zone label */}
                <span className="text-[8px] font-mono font-bold text-theme-text-muted uppercase w-14 truncate text-right">
                  {zone}
                </span>
                
                {/* Heatmap Row Cells */}
                <div className="flex-1 grid grid-cols-7 gap-1.5">
                  {heatmapData.hours.map((_, hIdx) => {
                    const val = heatmapData.grid[zIdx][hIdx];
                    let cellBg = 'bg-slate-900/60 border border-slate-800/40';
                    if (val === 1) cellBg = 'bg-red-500/20 border border-red-500/30';
                    else if (val === 2) cellBg = 'bg-red-500/40 border border-red-500/50';
                    else if (val >= 3) cellBg = 'bg-red-500/80 border border-red-500';

                    return (
                      <div
                        key={hIdx}
                        title={`Zone: ${zone} | Hour Block: ${heatmapData.hours[hIdx]} | Alerts: ${val}`}
                        className={`h-5 rounded-md transition-all duration-300 cursor-pointer ${cellBg}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {/* X-Axis labels */}
            <div className="flex items-center gap-2 mt-1">
              <span className="w-14 shrink-0" />
              <div className="flex-1 grid grid-cols-7 gap-1.5 text-center">
                {heatmapData.hours.map(hr => (
                  <span key={hr} className="text-[7px] font-mono font-bold text-theme-text-muted">
                    {hr}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Detailed Alert Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-theme-card border border-theme-border rounded-3xl p-6 w-full max-w-md flex flex-col gap-4 shadow-2xl relative text-theme-text">
            <div className="flex justify-between items-start border-b border-theme-border pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-red-500/10 text-red-400">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div className="flex flex-col leading-none">
                  <h4 className="text-sm font-black text-theme-text uppercase tracking-wider">{selectedAlert.alertType}</h4>
                  <span className="text-[9px] text-theme-text-muted font-mono mt-1">Time: {selectedAlert.time} | Camera: {selectedAlert.camera}</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black font-mono uppercase ${
                selectedAlert.severity === 'Critical' || selectedAlert.severity === 'High' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              }`}>
                {selectedAlert.severity}
              </span>
            </div>

            <div className="flex flex-col gap-3 text-xs leading-normal">
              <div className="grid grid-cols-3 gap-2 border-b border-theme-border pb-3 font-semibold">
                <div>
                  <span className="text-[9px] text-theme-text-muted uppercase block">Worker</span>
                  <span className="text-theme-text-secondary mt-0.5 block">{selectedAlert.worker}</span>
                </div>
                <div>
                  <span className="text-[9px] text-theme-text-muted uppercase block">Zone</span>
                  <span className="text-theme-text-secondary mt-0.5 block">{selectedAlert.zone}</span>
                </div>
                <div>
                  <span className="text-[9px] text-theme-text-muted uppercase block">Status</span>
                  <span className="text-theme-text-secondary mt-0.5 block flex items-center gap-1">
                    {selectedAlert.status === 'Open' ? <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" /> : <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
                    {selectedAlert.status}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[9px] text-theme-text-muted uppercase font-bold block">Incident Description</span>
                <p className="text-theme-text mt-1 leading-relaxed">{selectedAlert.description}</p>
              </div>

              <div>
                <span className="text-[9px] text-theme-text-muted uppercase font-bold block">Corrective Action recommended</span>
                <p className="text-emerald-400/90 font-mono text-[10px] mt-1 leading-relaxed bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
                  {selectedAlert.actionRecommended}
                </p>
              </div>
            </div>

            {errorMessage && (
              <div className="text-[10px] font-bold font-mono text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl mb-3 leading-tight uppercase w-full">
                ⚠️ {errorMessage}
              </div>
            )}

            <div className="flex gap-2 pt-3 border-t border-theme-border">
              <button
                onClick={() => setSelectedAlert(null)}
                className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-theme-border bg-transparent hover:bg-theme-card-hover text-theme-text transition-all"
              >
                Close
              </button>

              {selectedAlert.statusRaw !== 'resolved' && selectedAlert.status !== 'Resolved' && (
                <>
                  {(selectedAlert.statusRaw === 'open') && selectedAlert.source !== 'mock' && (
                    <button
                      onClick={handleAcknowledgeAlert}
                      disabled={actionInProgress}
                      className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 text-amber-400 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {actionInProgress ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Acknowledge'}
                    </button>
                  )}
                  <button
                    onClick={handleResolveAlert}
                    disabled={actionInProgress}
                    className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {actionInProgress ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Mark Resolved'}
                  </button>
                </>
              )}

              {(selectedAlert.statusRaw === 'resolved' || selectedAlert.status === 'Resolved') && (
                <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Resolved
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
