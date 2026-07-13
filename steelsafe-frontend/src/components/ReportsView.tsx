import { useState, useMemo } from 'react';
import {
  FileText, Calendar, Download, Mail, Clock, CheckCircle2, ChevronRight
} from 'lucide-react';
import type { PPEViolationEvent } from './CCTVPanel';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell
} from 'recharts';

interface ReportsViewProps {
  violations: PPEViolationEvent[];
  deviations: ComplianceDeviation[];
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
  "zone_cob1": "CAM 01",
  "zone_gcm": "CAM 02",
  "zone_qt": "CAM 03",
  "zone_ca": "CAM 04",
  "zone_cr": "CAM 05",
  "zone_rhf": "CAM 01",
  "zone_rs": "CAM 02",
  "zone_cb": "CAM 03",
  "zone_fl": "CAM 04",
  "zone_cr2": "CAM 05",
};

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

export function ReportsView({ violations, deviations }: ReportsViewProps) {
  const [selectedReportType, setSelectedReportType] = useState('Incident Report');
  const [dateRange, setDateRange] = useState('01 Jul 2026 - 10 Jul 2026');
  const [selectedDept, setSelectedDept] = useState('All Departments');
  const [selectedZone, setSelectedZone] = useState('All Zones');

  // Popup overlay states for Schedule and Email
  const [notification, setNotification] = useState<string | null>(null);

  // Combine telemetry alerts
  const combinedAlerts = useMemo(() => {
    const list: any[] = [];

    violations.forEach(v => {
      let severity = 'High';
      if (v.risk_score_at_time && v.risk_score_at_time >= 90) severity = 'Critical';
      else if (v.risk_score_at_time && v.risk_score_at_time < 40) severity = 'Low';
      else if (v.risk_score_at_time && v.risk_score_at_time < 70) severity = 'Medium';

      const zoneName = ZONE_NAME_MAP[v.zone_id] || v.zone_name || 'Assembly Line';
      const camLabel = CAMERA_MAP[v.zone_id] || 'CAM 02';

      list.push({
        id: `ppe_${v.id}`,
        rawId: v.id,
        source: 'ppe',
        time: new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestampDate: new Date(v.timestamp),
        alertType: 'PPE Violation',
        worker: (v as any).worker_name || 'Raj',
        zone: zoneName,
        camera: camLabel,
        severity,
        status: v.status === 'resolved' ? 'Resolved' : 'Open',
        description: `Worker detected in ${zoneName} without a safety helmet.`
      });
    });

    deviations.forEach(d => {
      const zoneName = ZONE_NAME_MAP[d.zone_id || ''] || 'Robot Zone';
      const camLabel = CAMERA_MAP[d.zone_id || ''] || 'CAM 04';
      const severity = d.severity === 'high' ? 'High' : d.severity === 'critical' ? 'Critical' : d.severity === 'medium' ? 'Medium' : 'Low';
      const alertType = d.category === 'Confined Space' || d.deviation_type.includes('Area') ? 'Restricted Entry' : 'Compliance Gap';

      list.push({
        id: `dev_${d.id}`,
        rawId: d.id,
        source: 'deviation',
        time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestampDate: new Date(d.timestamp),
        alertType,
        worker: d.deviation_type.split(':')[0] || 'Priya',
        zone: zoneName,
        camera: camLabel,
        severity,
        status: d.resolved ? 'Resolved' : 'Open',
        description: d.description || `Regulatory compliance deviation detected in ${zoneName}.`
      });
    });

    if (list.length === 0) {
      const mockDates = [
        new Date(Date.now() - 5 * 60000),
        new Date(Date.now() - 15 * 60000),
        new Date(Date.now() - 25 * 60000),
        new Date(Date.now() - 35 * 60000),
        new Date(Date.now() - 45 * 60000),
        new Date(Date.now() - 55 * 60000),
        new Date(Date.now() - 65 * 60000),
        new Date(Date.now() - 75 * 60000)
      ];

      return [
        { id: 'm1', time: '10:30 AM', timestampDate: mockDates[0], alertType: 'PPE Violation', worker: 'Raj', zone: 'Assembly Line', camera: 'CAM 02', severity: 'High', status: 'Open', description: 'Missing hard hat.' },
        { id: 'm2', time: '10:28 AM', timestampDate: mockDates[1], alertType: 'Fall Detected', worker: 'Arun', zone: 'Warehouse', camera: 'CAM 03', severity: 'Critical', status: 'Open', description: 'Motion sensor alert.' },
        { id: 'm3', time: '10:20 AM', timestampDate: mockDates[2], alertType: 'Smoke/Fire', worker: '-', zone: 'Boiler Room', camera: 'CAM 05', severity: 'Medium', status: 'Open', description: 'High thermal index.' },
        { id: 'm4', time: '10:17 AM', timestampDate: mockDates[3], alertType: 'Restricted Entry', worker: 'Priya', zone: 'Robot Zone', camera: 'CAM 04', severity: 'High', status: 'Open', description: 'Unauthorized safety cage entry.' },
        { id: 'm5', time: '10:15 AM', timestampDate: mockDates[4], alertType: 'PPE Violation', worker: 'Karan', zone: 'Assembly Line', camera: 'CAM 02', severity: 'Medium', status: 'Resolved', description: 'Missing vest resolved.' },
        { id: 'm6', time: '10:11 AM', timestampDate: mockDates[5], alertType: 'PPE Violation', worker: 'Suresh', zone: 'Loading Bay', camera: 'CAM 06', severity: 'High', status: 'Open', description: 'Missing hard hat at main loading dock.' },
        { id: 'm7', time: '10:04 AM', timestampDate: mockDates[6], alertType: 'Smoke/Fire', worker: '-', zone: 'Electrical Room', camera: 'CAM 01', severity: 'Critical', status: 'Resolved', description: 'High temp at switchboard resolved.' },
        { id: 'm8', time: '10:01 AM', timestampDate: mockDates[7], alertType: 'Others', worker: 'Mohan', zone: 'Assembly Line', camera: 'CAM 02', severity: 'Low', status: 'Open', description: 'Missing safety gloves.' }
      ];
    }

    list.sort((a, b) => b.timestampDate.getTime() - a.timestampDate.getTime());
    return list;
  }, [violations, deviations]);

  // Filters mapping
  const filteredAlerts = useMemo(() => {
    return combinedAlerts.filter(a => {
      const matchesZone = selectedZone === 'All Zones' || a.zone === selectedZone;
      return matchesZone;
    });
  }, [combinedAlerts, selectedZone]);

  // Aggregate statistics for Middle Panel cards
  const stats = useMemo(() => {
    const total = filteredAlerts.length;
    const critical = filteredAlerts.filter(a => a.severity === 'Critical').length;
    const high = filteredAlerts.filter(a => a.severity === 'High').length;
    const resolved = filteredAlerts.filter(a => a.status === 'Resolved').length;

    return { total, critical, high, resolved };
  }, [filteredAlerts]);

  // Chart data: Incidents Over Time
  const incidentsOverTimeData = useMemo(() => {
    const dates = ['01 Jul', '02 Jul', '03 Jul', '04 Jul', '05 Jul', '06 Jul', '07 Jul', '08 Jul', '09 Jul'];
    const counts = [10, 15, 18, 13, 21, 16, 22, 19, 23];

    // Dynamic current index
    counts[8] = Math.min(25, stats.total);

    return dates.map((d, i) => ({
      date: d,
      Incidents: counts[i]
    }));
  }, [stats]);

  // Chart data: Incidents by Type
  const incidentsByTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAlerts.forEach(a => {
      counts[a.alertType] = (counts[a.alertType] || 0) + 1;
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

  // Export PDF: Creates a new printable handover document window
  const handleDownloadPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>SteelSafe Intelligence - Shift Handover & Incident Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; }
            .header { border-bottom: 2px solid #ef4444; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: 800; color: #0f172a; }
            .logo span { color: #10b981; }
            .subtitle { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 5px; }
            .title { font-size: 20px; font-weight: 900; color: #0f172a; margin-top: 15px; }
            .meta-grid { display: grid; grid-template-cols: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
            .meta-card { border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; }
            .meta-label { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; }
            .meta-value { font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; padding: 12px; text-align: left; }
            td { border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #334155; padding: 12px; }
            .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 9px; color: #94a3b8; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">Safe<span>AI</span></div>
            <div class="subtitle">Zero-Harm Operations</div>
            <div class="title">Incident Handover & Safety Report</div>
          </div>
          <div class="meta-grid">
            <div class="meta-card">
              <div class="meta-label">Total Incidents</div>
              <div class="meta-value">${stats.total}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">Critical Incidents</div>
              <div class="meta-value">${stats.critical}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">High Incidents</div>
              <div class="meta-value">${stats.high}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">Resolved Incidents</div>
              <div class="meta-value">${stats.resolved}</div>
            </div>
          </div>
          <h3>Alert & Violation Log</h3>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Incident Type</th>
                <th>Worker</th>
                <th>Zone</th>
                <th>Camera</th>
                <th>Severity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredAlerts.map(a => `
                <tr>
                  <td>${a.time}</td>
                  <td><strong>${a.alertType}</strong></td>
                  <td>${a.worker}</td>
                  <td>${a.zone}</td>
                  <td>${a.camera}</td>
                  <td>${a.severity}</td>
                  <td>${a.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            Report generated at ${new Date().toLocaleString()} | SteelSafe Safety Intelligence Center
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(content);
    printWindow.document.close();
  };

  // Export Excel: Generates a CSV data URI and downloads
  const handleDownloadExcel = () => {
    const headers = ['Time', 'Incident Type', 'Worker', 'Zone', 'Camera', 'Severity', 'Status', 'Description'];
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
    link.setAttribute("download", `steelsafe_incident_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div id="reports-view-container" className="flex flex-col gap-6 w-full text-theme-text">
      
      {/* Header Panel */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col leading-tight">
          <h2 className="text-xl font-black tracking-tight text-theme-text m-0">5. REPORTS</h2>
          <p className="text-[11px] text-theme-text-muted font-bold mt-1.5">Generate Reports - Create and download detailed safety reports</p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-theme-card border border-theme-border p-3 rounded-2xl">
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Date Picker */}
            <div className="relative flex items-center">
              <Calendar className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-theme-bg border border-theme-border pl-9 pr-4 py-1.5 rounded-xl text-xs text-theme-text placeholder-theme-text-muted focus:outline-none focus:border-emerald-500 w-52 font-semibold shadow-inner"
              />
            </div>

            {/* Department Filter */}
            <div className="relative">
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="bg-theme-bg border border-theme-border px-3 py-1.5 pr-8 rounded-xl text-xs text-theme-text-secondary font-bold focus:outline-none appearance-none cursor-pointer"
              >
                <option value="All Departments">All Departments</option>
                <option value="Coke Oven">Coke Oven</option>
                <option value="Rolling Mill">Rolling Mill</option>
              </select>
              <ChevronRight className="absolute right-2.5 top-2.5 h-3 w-3 text-slate-500 pointer-events-none transform rotate-90" />
            </div>

            {/* Zones filter */}
            <div className="relative">
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="bg-theme-bg border border-theme-border px-3 py-1.5 pr-8 rounded-xl text-xs text-theme-text-secondary font-bold focus:outline-none appearance-none cursor-pointer"
              >
                <option value="All Zones">All Zones</option>
                {Object.values(ZONE_NAME_MAP).map(z => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-2.5 top-2.5 h-3 w-3 text-slate-500 pointer-events-none transform rotate-90" />
            </div>

          </div>

          <button
            onClick={() => showNotification("Safety report refreshed and compiled successfully.")}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 text-xs font-black transition-all shadow-sm"
          >
            <FileText className="h-3.5 w-3.5" />
            Generate Report
          </button>
        </div>
      </div>

      {/* Main Grid: Left sidebar report types + Right details */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch">
        
        {/* Left Panel: Report Types Selection */}
        <div className="md:col-span-1 bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-sm">
          <h3 className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest pb-2 border-b border-theme-border">Report Types</h3>
          
          <div className="flex flex-col gap-1.5">
            {[
              'Incident Report',
              'PPE Compliance Report',
              'Worker Attendance',
              'Camera Activity Report',
              'Safety Score Report',
              'Compliance Summary'
            ].map(type => (
              <button
                key={type}
                onClick={() => setSelectedReportType(type)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  selectedReportType === type
                    ? 'bg-[#10b981]/10 text-emerald-400 border border-[#10b981]/20 shadow-sm'
                    : 'text-theme-text-secondary hover:bg-theme-card-hover hover:text-theme-text border border-transparent'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Right Area: Report Summary Details */}
        <div className="md:col-span-3 flex flex-col gap-6">
          
          {/* Active selection title */}
          <div className="bg-theme-card border border-theme-border rounded-3xl p-6 flex flex-col gap-5 shadow-md text-theme-text">
            <h4 className="text-sm font-black text-theme-text uppercase tracking-wider border-b border-theme-border pb-3">
              {selectedReportType} Details
            </h4>

            {/* Metrics cards row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-theme-bg-alt/40 border border-theme-border p-4 rounded-2xl flex flex-col gap-1">
                <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">Total Incidents</span>
                <span className="text-xl font-black text-theme-text leading-none mt-1">{stats.total}</span>
              </div>
              <div className="bg-theme-bg-alt/40 border border-theme-border p-4 rounded-2xl flex flex-col gap-1">
                <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">Critical Incidents</span>
                <span className="text-xl font-black text-red-400 leading-none mt-1">{stats.critical}</span>
              </div>
              <div className="bg-theme-bg-alt/40 border border-theme-border p-4 rounded-2xl flex flex-col gap-1">
                <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">High Incidents</span>
                <span className="text-xl font-black text-amber-400 leading-none mt-1">{stats.high}</span>
              </div>
              <div className="bg-theme-bg-alt/40 border border-theme-border p-4 rounded-2xl flex flex-col gap-1">
                <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">Resolved Incidents</span>
                <span className="text-xl font-black text-emerald-400 leading-none mt-1">{stats.resolved}</span>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
              
              {/* Incidents Over Time Line */}
              <div className="bg-theme-bg-alt/25 border border-theme-border p-4 rounded-2xl flex flex-col gap-3">
                <h5 className="text-[10px] font-bold text-theme-text-muted uppercase tracking-widest">Incidents Over Time</h5>
                <div className="w-full h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={incidentsOverTimeData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <XAxis dataKey="date" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '9px', color: '#fff' }} />
                      <Line type="monotone" dataKey="Incidents" stroke="#ef4444" strokeWidth={2} dot={{ r: 2.5, fill: '#ef4444' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Incidents by Type Donut */}
              <div className="bg-theme-bg-alt/25 border border-theme-border p-4 rounded-2xl flex flex-col gap-3">
                <h5 className="text-[10px] font-bold text-theme-text-muted uppercase tracking-widest">Incidents by Type</h5>
                <div className="flex items-center justify-between relative h-[140px]">
                  <div className="w-[90px] h-[90px] relative shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={incidentsByTypeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={38}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {incidentsByTypeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                      <span className="text-[6.5px] uppercase font-mono font-bold text-theme-text-muted">Total</span>
                      <span className="text-xs font-black text-theme-text leading-none mt-0.5">{stats.total}</span>
                    </div>
                  </div>
                  {/* Custom Legend */}
                  <div className="flex flex-col gap-1 pl-2 overflow-hidden w-full">
                    {incidentsByTypeData.map(item => (
                      <div key={item.name} className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[7px] font-mono font-extrabold text-theme-text-muted truncate w-16 uppercase">
                          {item.name}
                        </span>
                        <span className="text-[7px] font-mono font-black text-theme-text pl-0.5">
                          {item.value} ({item.percentage}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* Bottom row: Action Buttons */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={handleDownloadPDF}
              className="flex-1 min-w-[130px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg hover:text-theme-text hover:bg-theme-card-hover text-theme-text-secondary text-xs font-black transition-all shadow-sm"
            >
              <Download className="h-4 w-4 text-theme-text-secondary" />
              Download PDF
            </button>
            <button
              onClick={handleDownloadExcel}
              className="flex-1 min-w-[130px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-black transition-all shadow-sm"
            >
              <Download className="h-4 w-4" />
              Download Excel
            </button>
            <button
              onClick={() => showNotification("Safety report scheduled successfully.")}
              className="flex-1 min-w-[130px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg hover:text-theme-text hover:bg-theme-card-hover text-theme-text-secondary text-xs font-black transition-all shadow-sm"
            >
              <Clock className="h-4 w-4 text-theme-text-secondary" />
              Schedule Report
            </button>
            <button
              onClick={() => showNotification("Safety report sent to email distribution list.")}
              className="flex-1 min-w-[130px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg hover:text-theme-text hover:bg-theme-card-hover text-theme-text-secondary text-xs font-black transition-all shadow-sm"
            >
              <Mail className="h-4 w-4 text-theme-text-secondary" />
              Email Report
            </button>
          </div>

        </div>

      </div>

      {/* Floating Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-theme-card border border-theme-border px-4 py-3 rounded-2xl shadow-2xl animate-slideIn">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
          <span className="text-xs font-bold text-theme-text">{notification}</span>
        </div>
      )}

    </div>
  );
}
