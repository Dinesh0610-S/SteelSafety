import { useState, useEffect, useMemo } from 'react';
import {
  ChevronRight, AlertTriangle, Clock, Download, CheckCircle, FileText, Save
} from 'lucide-react';

interface IncidentDetailsViewProps {
  alert: any;
  onBack: () => void;
  onResolve: (id: any) => void;
}

export function IncidentDetailsView({ alert, onBack, onResolve }: IncidentDetailsViewProps) {
  const [status, setStatus] = useState(alert.status);
  const [notes, setNotes] = useState('');
  
  const label = alert.alertType || alert.label || 'Safety Deviation';
  
  // Actions checklist
  const [actions, setActions] = useState({
    dispatch: false,
    isolate: false,
    firstAid: false,
    briefing: false
  });

  // Load persisted notes and actions from localStorage on mount
  useEffect(() => {
    const savedNotes = localStorage.getItem(`steelsafe_incident_notes_${alert.id}`);
    if (savedNotes) setNotes(savedNotes);

    const savedActions = localStorage.getItem(`steelsafe_incident_actions_${alert.id}`);
    if (savedActions) {
      try {
        setActions(JSON.parse(savedActions));
      } catch (_) {}
    }
  }, [alert.id]);

  const handleSaveNotes = () => {
    localStorage.setItem(`steelsafe_incident_notes_${alert.id}`, notes);
    localStorage.setItem(`steelsafe_incident_actions_${alert.id}`, JSON.stringify(actions));
    alert.status = status; // Sync local object status reference
    window.dispatchEvent(new Event('steelsafe_alert_updated'));
  };

  const handleMarkResolved = () => {
    onResolve(alert.rawId || alert.id);
    setStatus('Resolved');
    // Save to local storage sync
    localStorage.setItem(`steelsafe_resolved_${alert.id}`, 'true');
    // Also trigger custom event to notify parent components
    window.dispatchEvent(new Event('steelsafe_alert_updated'));
  };

  const toggleAction = (key: keyof typeof actions) => {
    setActions(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(`steelsafe_incident_actions_${alert.id}`, JSON.stringify(next));
      return next;
    });
  };

  // Timeline milestones
  const timelineMilestones = useMemo(() => {
    const rawTime = alert.time || '10:29 AM';
    
    // Parse time components
    let hh = 10;
    let mm = 29;
    let ampm = 'AM';
    const match = rawTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) {
      hh = parseInt(match[1]);
      mm = parseInt(match[2]);
      ampm = match[3].toUpperCase();
    }

    const pad = (n: number) => n.toString().padStart(2, '0');

    return [
      { time: `${pad(hh)}:${pad(mm)}:10 ${ampm}`, event: label || 'Incident Detected', desc: 'Computer vision model flagged safety deviation.' },
      { time: `${pad(hh)}:${pad(mm)}:12 ${ampm}`, event: 'Alert Triggered', desc: 'Alarm routed to Main plant office dashboard.' },
      { time: `${pad(hh)}:${pad(mm)}:18 ${ampm}`, event: 'Supervisor Notified', desc: 'Siren sound and visual alerts flashed.' },
      { time: `${pad(hh)}:${pad(mm)}:45 ${ampm}`, event: 'Action Initiated', desc: 'Safety team dispatched to investigate.' },
      { 
        time: status === 'Resolved' ? `${pad(hh)}:${pad(mm + 2)}:15 ${ampm}` : 'Pending', 
        event: 'Incident Closed', 
        desc: status === 'Resolved' ? 'Incident marked resolved by operator.' : 'Awaiting confirmation.' 
      }
    ];
  }, [alert.time, label, status]);

  // Export data payload
  const handleDownloadEvidence = () => {
    const content = `STEELSAFE INTELLIGENCE - INCIDENT EVIDENCE REPORT
--------------------------------------------------
Incident ID: ${alert.id}
Event: ${label}
Time: ${alert.time}
Location: ${alert.zone}
Camera: ${alert.camera}
Worker: ${alert.worker}
Severity: ${alert.severity}
Status: ${status}
AI Confidence: 96%

TIMELINE LOGS:
${timelineMilestones.map(m => `- [${m.time}] ${m.event} (${m.desc})`).join('\n')}

ACTIONS TAKEN:
- Dispatch Safety Operator: ${actions.dispatch ? 'YES' : 'NO'}
- Isolate Zone / Equipment: ${actions.isolate ? 'YES' : 'NO'}
- First Aid Administered: ${actions.firstAid ? 'YES' : 'NO'}
- Shift Handover Briefing Logged: ${actions.briefing ? 'YES' : 'NO'}

SUPERVISOR NOTES:
${notes || 'No supervisor notes recorded.'}
--------------------------------------------------
Report generated on: ${new Date().toLocaleString()}
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Evidence_Report_${alert.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="incident-details-view" className="flex flex-col gap-6 w-full text-slate-100">
      
      {/* Breadcrumb Header */}
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        <button onClick={onBack} className="hover:text-emerald-400 transition-all cursor-pointer">
          Alerts
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="text-theme-text-muted">Incident Details</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        
        {/* Left: Snapshot Panel */}
        <div className="xl:col-span-1 bg-theme-card border border-theme-border p-5 rounded-3xl flex flex-col gap-4 shadow-md justify-between">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                {(label || 'Safety').split(' ')[0]} Detected
              </span>
              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                alert.severity === 'Critical' || alert.severity === 'High'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {alert.severity}
              </span>
            </div>
            <span className="text-[9px] font-mono text-theme-text-muted font-bold uppercase">{alert.camera}</span>
          </div>

          {/* Styled CCTV Snapshot Placeholder */}
          <div className="relative aspect-video rounded-2xl border border-theme-border bg-theme-well overflow-hidden flex items-center justify-center shadow-inner group">
            {/* Camera grid overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.35)_95%),linear-gradient(90deg,rgba(18,24,38,0)_95%,rgba(0,0,0,0.35)_95%)] bg-[size:15px_15px] pointer-events-none opacity-20" />
            <div className="absolute inset-4 border-2 border-dashed border-red-500/30 rounded flex flex-col items-center justify-center text-center p-4">
              <AlertTriangle className="h-8 w-8 text-red-400 animate-pulse mb-2" />
              <span className="text-[10px] font-mono font-bold text-theme-text uppercase tracking-wider">{label}</span>
              <span className="text-[7.5px] font-mono text-theme-text-muted mt-1">{alert.zone} - Bounding Box Target Frame</span>
            </div>
          </div>

          <div className="text-[8.5px] text-theme-text-muted font-bold leading-normal text-center mt-2 uppercase tracking-wide">
            CCTV Telemetry Capture
          </div>
        </div>

        {/* Middle: Incident Information */}
        <div className="xl:col-span-1 bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col justify-between shadow-md">
          <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted pb-3 border-b border-theme-border flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-emerald-400" />
            Incident Information
          </h4>

          <div className="flex flex-col gap-3.5 py-4 text-xs font-semibold">
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">Incident ID</span>
              <span className="text-theme-text font-mono">{alert.id}</span>
            </div>
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">Time/Date</span>
              <span className="text-theme-text font-mono">{alert.time}</span>
            </div>
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">Location</span>
              <span className="text-theme-text font-mono">{alert.zone}</span>
            </div>
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">Camera</span>
              <span className="text-theme-text font-mono">{alert.camera}</span>
            </div>
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">Worker</span>
              <span className="text-theme-text font-extrabold">{alert.worker}</span>
            </div>
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">Severity</span>
              <span className={`font-black uppercase ${
                alert.severity === 'Critical' || alert.severity === 'High' ? 'text-red-400' : 'text-amber-400'
              }`}>{alert.severity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-theme-text-muted">AI Confidence</span>
              <span className="text-emerald-400 font-mono">96%</span>
            </div>
          </div>

          <div className="w-full" />
        </div>

        {/* Right: Timeline Panel */}
        <div className="xl:col-span-1 bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col justify-between shadow-md">
          <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted pb-3 border-b border-theme-border flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-emerald-400" />
            Timeline Logs
          </h4>

          <div className="flex-1 flex flex-col gap-4 py-4 text-xs font-semibold">
            {timelineMilestones.map((milestone, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    milestone.time === 'Pending' ? 'bg-slate-700 animate-pulse' : 'bg-emerald-500 shadow'
                  }`} />
                  {idx < timelineMilestones.length - 1 && (
                    <div className="h-8 w-0.5 bg-theme-border" />
                  )}
                </div>
                <div className="flex flex-col leading-tight -mt-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-theme-text font-black">{milestone.event}</span>
                    <span className="text-[8.5px] font-mono text-theme-text-muted">{milestone.time}</span>
                  </div>
                  <span className="text-[9px] text-theme-text-muted font-semibold leading-normal mt-0.5">{milestone.desc}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="w-full" />
        </div>

      </div>

      {/* Bottom section: Actions Taken + Notes & Buttons */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        
        {/* Actions Taken checklist */}
        <div className="xl:col-span-1 bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md">
          <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Actions Taken</h4>
          
          <div className="flex flex-col gap-3.5 mt-2">
            
            <label className="flex items-center gap-2.5 text-xs font-bold text-theme-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={actions.dispatch}
                onChange={() => toggleAction('dispatch')}
                className="h-4 w-4 bg-theme-bg-alt border border-theme-border rounded focus:ring-0 accent-emerald-500 cursor-pointer"
              />
              <span>Dispatch Safety Operator</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-bold text-theme-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={actions.isolate}
                onChange={() => toggleAction('isolate')}
                className="h-4 w-4 bg-theme-bg-alt border border-theme-border rounded focus:ring-0 accent-emerald-500 cursor-pointer"
              />
              <span>Isolate Zone / Equipment</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-bold text-theme-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={actions.firstAid}
                onChange={() => toggleAction('firstAid')}
                className="h-4 w-4 bg-theme-bg-alt border border-theme-border rounded focus:ring-0 accent-emerald-500 cursor-pointer"
              />
              <span>First Aid Administered</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-bold text-theme-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={actions.briefing}
                onChange={() => toggleAction('briefing')}
                className="h-4 w-4 bg-theme-bg-alt border border-theme-border rounded focus:ring-0 accent-emerald-500 cursor-pointer"
              />
              <span>Log in Handover Briefing</span>
            </label>

          </div>
        </div>

        {/* Notes input */}
        <div className="xl:col-span-2 bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md justify-between">
          <div className="flex items-center justify-between border-b border-theme-border pb-2">
            <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Supervisor Notes</h4>
            <button
              onClick={handleSaveNotes}
              className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              Save Note
            </button>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add comments on incident investigation, corrective steps, or checkup reports..."
            className="w-full flex-1 bg-theme-bg-alt/60 border border-theme-border rounded-2xl p-3.5 text-xs font-semibold text-theme-text placeholder-theme-text-muted focus:outline-none focus:border-theme-border resize-none min-h-[70px] mt-2"
          />

          <div className="flex items-center justify-end gap-3 mt-4">
            <button
              onClick={handleDownloadEvidence}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-theme-bg-alt border border-theme-border text-theme-text-secondary hover:text-theme-text text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Download Evidence
            </button>

            {status === 'Open' && (
              <button
                onClick={handleMarkResolved}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black rounded-xl transition-all shadow-md cursor-pointer"
              >
                <CheckCircle className="h-4.5 w-4.5" />
                Mark Resolved
              </button>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
