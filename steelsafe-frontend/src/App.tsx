import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlayback } from './hooks/usePlayback';
import { usePlantData } from './hooks/usePlantData';
import type { PPEViolationEvent } from './components/CCTVPanel';
import { CameraProvider } from './context/CameraContext';
import { PlantSwitcher } from './components/PlantSwitcher';
import { MainOfficePanel } from './components/MainOfficePanel';
import { ShiftBriefingModal } from './components/ShiftBriefingModal';
import { PlantProvider, usePlant } from './context/PlantContext';
import { 
  Shield, AlertCircle, RefreshCw, Sun, Moon, FileText,
  LayoutDashboard, Bell, ShieldCheck, BarChart3, Settings,
  Users, Hammer, Calendar, ChevronDown, Eye, Clock, Map, MessageSquare
} from 'lucide-react';
import { ChatPanel } from './components/ChatPanel';
import { SystemHealthIndicator } from './components/SystemHealthIndicator';
import { UnifiedIncidentPanel } from './components/UnifiedIncidentPanel';
import { DashboardShell, OverallSafetyScoreWidget } from './components/DashboardShell';
import { LiveMonitoringView } from './components/LiveMonitoringView';
import { PPEComplianceView } from './components/PPEComplianceView';
import { SafetyAnalyticsView } from './components/SafetyAnalyticsView';
import { ReportsView } from './components/ReportsView';
import { DevicesView } from './components/DevicesView';
import { EmployeesView } from './components/EmployeesView';
import { SettingsView } from './components/SettingsView';
import { EmployeeDetailsView } from './components/EmployeeDetailsView';
import { CameraDetailsView } from './components/CameraDetailsView';
import { IncidentDetailsView } from './components/IncidentDetailsView';
import { FactoryMapView } from './components/FactoryMapView';

function DashboardContent() {
  const { activePlantId } = usePlant();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<string>('dashboard');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  const [showBriefing, setShowBriefing] = useState(false);
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Record<string, number>>({});
  // PPE violation state — polled from backend every 3 s
  const [ppeViolations, setPpeViolations] = useState<PPEViolationEvent[]>([]);
  const [ppeOpenCount, setPpeOpenCount] = useState<number>(0);

  // Compliance deviations state for score calculations
  const [deviations, setDeviations] = useState<any[]>([]);
  useEffect(() => {
    if (!activePlantId) return;
    const fetchDevs = async () => {
      try {
        const res = await fetch(`/api/v1/risk/compliance/deviations?plant_id=${activePlantId}`);
        if (res.ok) setDeviations(await res.json());
      } catch (_) {}
    };
    fetchDevs();
    const interval = setInterval(fetchDevs, 3000);
    return () => clearInterval(interval);
  }, [activePlantId]);

  // Reset selected employee/camera/alert when navigating tabs
  useEffect(() => {
    setSelectedEmployeeId(null);
    setSelectedCameraId(null);
    setSelectedAlert(null);
  }, [activeNav]);

  // Live Time/Clock states
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const formattedDate = currentTime.toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' });

  // Subtitle custom state (editable & persisted)
  const [editableSubtitle, setEditableSubtitle] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('steelsafe_subtitle');
      if (saved) return saved;
    } catch (_) {}
    return "Smart Monitoring. Instant Alerts. Zero Harm.";
  });
  const [isEditingSubtitle, setIsEditingSubtitle] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('steelsafe_subtitle', editableSubtitle);
    } catch (_) {}
  }, [editableSubtitle]);

  // Theme support with persistence and system defaults
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (e) {}
    return 'light';
  });

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('theme', next); } catch (e) {}
      return next;
    });
  };

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  // Poll PPE violations every 3 s
  const fetchViolations = useCallback(async () => {
    if (!activePlantId) return;
    try {
      const res = await fetch(`/api/v1/risk/ppe/violations?limit=100&plant_id=${activePlantId}`);
      if (res.ok) {
        const data: PPEViolationEvent[] = await res.json();
        setPpeViolations(data);
        setPpeOpenCount(data.filter(v => v.status === 'open').length);
      }
    } catch (_) {}
  }, [activePlantId]);

  useEffect(() => {
    fetchViolations();
    const interval = setInterval(fetchViolations, 3000);
    return () => clearInterval(interval);
  }, [fetchViolations]);

  const handleAcknowledgeViolation = useCallback(async (id: number) => {
    await fetch(`/api/v1/risk/ppe/violations/${id}/acknowledge`, { method: 'POST' });
    await fetchViolations();
  }, [fetchViolations]);

  const handleResolveViolation = useCallback(async (id: number) => {
    await fetch(`/api/v1/risk/ppe/violations/${id}/resolve`, { method: 'POST' });
    await fetchViolations();
  }, [fetchViolations]);

  const handlePPEViolation = useCallback((event: PPEViolationEvent) => {
    setPpeViolations(prev => [event, ...prev]);
    setPpeOpenCount(c => c + 1);
  }, []);

  const handleSelectZone = (zoneId: string | null) => {
    setSelectedZoneId(zoneId);
  };

  const { t0Str, loading, error } = usePlantData(null, selectedZoneId, activePlantId);
  const playback = usePlayback(t0Str, () => handleSelectZone(null));
  const plantData = usePlantData(playback.virtualTime, selectedZoneId, activePlantId);

  const activeEscalations = useMemo(() => {
    return Object.entries(plantData.currentRisks)
      .filter(([_, r]) => r.risk_level === 'critical' || r.risk_level === 'high')
      .map(([id, r]) => ({
        zoneId: id,
        zoneName: plantData.zoneNames[id] || id,
        score: r.risk_score,
        riskLevel: r.risk_level,
        triggeredRules: r.triggered_rules,
        explanation: r.explanation
      }))
      .sort((a, b) => b.score - a.score);
  }, [plantData.currentRisks, plantData.zoneNames]);

  const primaryEscalation = activeEscalations[0] || null;

  const [delayedShowEscalation, setDelayedShowEscalation] = useState(false);
  useEffect(() => {
    if (!primaryEscalation) {
      setDelayedShowEscalation(false);
      return;
    }
    const alreadyAcked = (acknowledgedAlerts[primaryEscalation.zoneId] ?? 0) >= primaryEscalation.score;
    if (alreadyAcked) {
      setDelayedShowEscalation(false);
      return;
    }

    const saved = localStorage.getItem('steelsafe_settings');
    let delaySec = 0;
    if (saved) {
      try {
        const config = JSON.parse(saved);
        if (primaryEscalation.riskLevel === 'critical') delaySec = config.delayCritical ?? 0;
        else if (primaryEscalation.riskLevel === 'high') delaySec = config.delayHigh ?? 5;
      } catch (_) {}
    }

    const timer = setTimeout(() => {
      setDelayedShowEscalation(true);
    }, delaySec * 1000);

    return () => clearTimeout(timer);
  }, [primaryEscalation?.zoneId, primaryEscalation?.score, acknowledgedAlerts]);

  const handleAcknowledgeEscalation = (operatorName: string) => {
    if (primaryEscalation) {
      console.log(`Escalation acknowledged by ${operatorName}`);
      setAcknowledgedAlerts(prev => ({
        ...prev,
        [primaryEscalation.zoneId]: primaryEscalation.score
      }));
    }
  };


  // Overall Safety Score computations
  const overallSafetyScore = useMemo(() => {
    const parsedRisks = Object.entries(plantData.currentRisks).map(([zoneId, item]) => {
      let snap = null;
      if (item.signal_snapshot) {
        try {
          snap = typeof item.signal_snapshot === 'string' 
            ? JSON.parse(item.signal_snapshot) 
            : item.signal_snapshot;
        } catch (_) {}
      }
      return { zone_id: zoneId, risk_level: item.risk_level, snap };
    });

    const totalWorkersCount = parsedRisks.reduce((acc, curr) => acc + (curr.snap?.workers_in_zone || 0), 0);
    const activePPEViolations = ppeViolations.filter(v => v.status === 'open' || v.status === 'acknowledged');
    const violatingZoneIds = new Set(activePPEViolations.map(v => v.zone_id));

    const safeWorkersCount = parsedRisks.reduce((acc, curr) => {
      if (violatingZoneIds.has(curr.zone_id)) return acc;
      return acc + (curr.snap?.workers_in_zone || 0);
    }, 0);

    const totalZones = parsedRisks.length || 5;
    const criticalZones = parsedRisks.filter(r => r.risk_level === 'critical' || r.risk_level === 'high').length;
    
    const R_risk = 1.0 - (criticalZones / totalZones);
    const R_ppe = totalWorkersCount === 0 ? 1.0 : (safeWorkersCount / totalWorkersCount);
    
    const activeDevs = deviations.filter(d => !d.resolved);
    const highDevs = activeDevs.filter(d => d.severity === 'high').length;
    const medDevs = activeDevs.filter(d => d.severity === 'medium').length;
    const complianceScore = Math.max(0, 100 - (highDevs * 15 + medDevs * 5));
    const R_audit = complianceScore / 100.0;

    const score = (0.4 * R_risk + 0.3 * R_ppe + 0.3 * R_audit) * 100;
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [plantData.currentRisks, ppeViolations, deviations]);

  const scoreLabel = useMemo(() => {
    if (overallSafetyScore >= 90) return { text: "Excellent", color: "text-emerald-500" };
    if (overallSafetyScore >= 80) return { text: "Good", color: "text-amber-500" };
    return { text: "Needs Attention", color: "text-red-500 animate-pulse" };
  }, [overallSafetyScore]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'live-monitoring', label: 'Live Monitoring', icon: Eye },
    { id: 'factory-map', label: 'Factory Map', icon: Map },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: ppeOpenCount },
    { id: 'safety-rag', label: 'Safety AI Chat', icon: MessageSquare },
    { id: 'ppe-compliance', label: 'PPE Compliance', icon: ShieldCheck },
    { id: 'safety-analytics', label: 'Safety Analytics', icon: BarChart3 },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'devices', label: 'Devices', icon: Hammer },
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-bg flex flex-col items-center justify-center text-theme-text-secondary gap-4 font-sans transition-colors duration-300">
        <RefreshCw className="h-10 w-10 text-theme-accent animate-spin" />
        <p className="text-sm font-semibold tracking-tight">Connecting to SteelSafe Telemetry Server...</p>
      </div>
    );
  }

  if (error || plantData.error) {
    return (
      <div className="min-h-screen bg-theme-bg flex flex-col items-center justify-center text-theme-text-secondary p-6 animate-fadeIn font-sans transition-colors duration-300">
        <div className="max-w-md bg-theme-card border border-theme-border rounded-3xl p-8 text-center flex flex-col items-center gap-4 shadow-xl">
          <AlertCircle className="h-12 w-12 text-theme-risk-crit animate-pulse" />
          <h2 className="text-lg font-bold text-theme-text tracking-tight">System Connectivity Issue</h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            {error || plantData.error}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-theme-accent hover:bg-theme-accent-hover text-white text-xs font-bold rounded-xl transition-all shadow-lg active:scale-[0.98]"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  
    return (
    <CameraProvider onPPEViolation={handlePPEViolation}>
      <div className="min-h-screen flex bg-theme-bg text-theme-text font-sans antialiased bg-grid-pattern transition-colors duration-300">
      <aside className="w-[220px] bg-theme-card border-r border-theme-border flex flex-col justify-between p-4 shrink-0 z-30 select-none text-theme-text">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2.5 border-b border-theme-border pb-4">
            <div className="p-2 rounded-xl bg-emerald-950/10 border border-emerald-500/20 flex items-center justify-center">
              <Shield className="h-5 w-5 text-emerald-400 fill-emerald-400/20" />
            </div>
            <div className="leading-tight">
              <h2 className="text-sm font-black tracking-tight text-theme-text select-none">
                Safe<span className="text-emerald-400">AI</span>
              </h2>
              <span className="text-[8px] font-bold text-theme-text-muted uppercase tracking-wider block">Zero-Harm Operations</span>
            </div>
          </div>
          <nav className="flex flex-col gap-2">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-2xl text-[11px] font-extrabold transition-all group relative ${
                  activeNav === item.id
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'text-theme-text-secondary hover:text-theme-text hover:bg-theme-card-hover'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-4.5 w-4.5 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.id === 'alerts' && ppeOpenCount > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-black ${
                    activeNav === item.id 
                      ? 'bg-slate-950 text-emerald-400' 
                      : 'bg-red-500 text-white animate-pulse'
                  }`}>
                    {ppeOpenCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-4 mt-6">
          <OverallSafetyScoreWidget 
            score={overallSafetyScore} 
            label={scoreLabel.text} 
            color={scoreLabel.color} 
          />
          <p className="text-[9px] text-theme-text-muted font-bold tracking-wide italic text-center select-none mt-2 border-t border-theme-border pt-3">
            Every Worker, Every Day, Go Home Safe.
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="border-b border-theme-border bg-theme-card sticky top-0 z-20 px-6 py-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col leading-tight">
              <h1 className="text-xl font-black tracking-tight text-theme-text m-0">
                AI-Powered Industrial Safety Intelligence
              </h1>
              <div className="flex items-center gap-2 mt-1">
                {isEditingSubtitle ? (
                  <input
                    type="text"
                    value={editableSubtitle}
                    onChange={(e) => setEditableSubtitle(e.target.value)}
                    onBlur={() => setIsEditingSubtitle(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setIsEditingSubtitle(false)}
                    className="bg-theme-well text-xs text-theme-text px-2 py-0.5 rounded border border-theme-border focus:outline-none focus:border-emerald-500 max-w-xs font-semibold"
                    autoFocus
                  />
                ) : (
                  <span 
                    onClick={() => setIsEditingSubtitle(true)}
                    className="text-[11px] text-theme-text-muted font-bold cursor-pointer hover:text-theme-text pb-0.5"
                    title="Click to edit subtitle"
                  >
                    {editableSubtitle}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <SystemHealthIndicator virtualTime={playback.virtualTime} />
              
              {/* Bell icon with badge */}
              <button 
                onClick={() => setActiveNav('alerts')}
                className="p-2.5 rounded-2xl bg-theme-bg-alt border border-theme-border text-theme-text-secondary hover:text-theme-text hover:bg-theme-card-hover shadow-sm transition-all flex items-center justify-center relative active:scale-95"
              >
                <Bell className="h-4.5 w-4.5" />
                {ppeOpenCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4.5 w-4.5 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-bounce">
                    {ppeOpenCount}
                  </span>
                )}
              </button>

              <button
                onClick={toggleTheme}
                className="p-2.5 rounded-2xl bg-theme-bg-alt border border-theme-border text-theme-text-secondary hover:bg-theme-card-hover shadow-sm active:scale-[0.98] transition-all flex items-center justify-center"
              >
                {theme === 'dark' ? <Sun className="h-4.5 w-4.5 text-amber-400" /> : <Moon className="h-4.5 w-4.5 text-[#6366f1]" />}
              </button>

              <button
                onClick={() => setShowBriefing(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-theme-bg-alt border border-theme-border text-theme-text-secondary hover:bg-theme-card-hover shadow-sm active:scale-[0.98] transition-all text-[9px] font-black font-mono uppercase tracking-wide"
              >
                <FileText className="h-3.5 w-3.5" />
                Briefing
              </button>

              <PlantSwitcher onSwitch={() => handleSelectZone(null)} />

              {/* User Stack */}
              <div className="flex items-center gap-2.5 bg-theme-bg-alt border border-theme-border px-3 py-2 rounded-2xl shrink-0 cursor-pointer select-none">
                <div className="h-7 w-7 rounded-full bg-theme-card border border-theme-border flex items-center justify-center text-[10px] font-black text-emerald-400 shadow-inner">
                  SO
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-[10px] font-extrabold text-theme-text">Safety Officer</span>
                  <span className="text-[8px] font-mono text-theme-text-muted mt-0.5">Admin</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-theme-text-secondary ml-0.5" />
              </div>
            </div>
          </div>

          {/* Time and Date Ticker right-aligned below header row */}
          <div className="flex justify-end items-center gap-2.5 text-[10px] font-mono font-black text-theme-text-muted pr-1 mt-1 select-none">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-theme-text-muted" /> {formattedDate}</span>
            <span className="text-theme-border">|</span>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-theme-text-muted" /> {formattedTime}</span>
          </div>
        </header>

        <main className="flex-1 p-6 flex flex-col gap-6">
          {activeNav === 'dashboard' ? (
            <DashboardShell
              activePlantId={activePlantId}
              currentRisks={plantData.currentRisks}
              t0={playback.t0}
              ppeViolations={ppeViolations}
              deviations={deviations}
              onViewAllAlerts={() => setActiveNav('alerts')}
            />
          ) : activeNav === 'live-monitoring' ? (
            selectedCameraId ? (
              <CameraDetailsView
                cameraId={selectedCameraId}
                violations={ppeViolations}
                deviations={deviations}
                onBack={() => setSelectedCameraId(null)}
              />
            ) : (
              <LiveMonitoringView
                activePlantId={activePlantId}
                currentRisks={plantData.currentRisks}
                t0={playback.t0}
                ppeViolations={ppeViolations}
                deviations={deviations}
                onPPEViolation={handlePPEViolation}
                onSelectCamera={(id) => setSelectedCameraId(id)}
              />
            )
          ) : activeNav === 'factory-map' ? (
            <FactoryMapView
              currentRisks={plantData.currentRisks}
              violations={ppeViolations}
              onSelectCamera={(id) => {
                setSelectedCameraId(id);
                setActiveNav('live-monitoring');
              }}
              onSelectZone={(id) => {
                setSelectedZoneId(id);
                setActiveNav('dashboard'); // Dashboard filters by selectedZoneId
              }}
            />
          ) : activeNav === 'ppe-compliance' ? (
            <PPEComplianceView
              violations={ppeViolations}
              onRefresh={fetchViolations}
            />
          ) : activeNav === 'safety-rag' ? (
            <ChatPanel
              selectedZoneId={selectedZoneId}
              selectedZoneName={selectedZoneId ? (plantData.zoneNames[selectedZoneId] || selectedZoneId) : ''}
            />
          ) : activeNav === 'alerts' ? (
            selectedAlert ? (
              <IncidentDetailsView
                alert={selectedAlert}
                onResolve={handleResolveViolation}
                onBack={() => setSelectedAlert(null)}
              />
            ) : (
              <MainOfficePanel
                violations={ppeViolations}
                deviations={deviations}
                onAcknowledge={handleAcknowledgeViolation}
                onResolve={handleResolveViolation}
                onRefresh={fetchViolations}
                onSelectAlert={(a) => setSelectedAlert(a)}
              />
            )
          ) : activeNav === 'safety-analytics' ? (
            <SafetyAnalyticsView
              activePlantId={activePlantId}
              violations={ppeViolations}
              deviations={deviations}
            />
          ) : activeNav === 'reports' ? (
            <ReportsView
              violations={ppeViolations}
              deviations={deviations}
            />
          ) : activeNav === 'devices' ? (
            <DevicesView />
          ) : activeNav === 'employees' ? (
            selectedEmployeeId ? (
              <EmployeeDetailsView
                employeeId={selectedEmployeeId}
                violations={ppeViolations}
                onBack={() => setSelectedEmployeeId(null)}
              />
            ) : (
              <EmployeesView
                violations={ppeViolations}
                onSelectEmployee={(id) => setSelectedEmployeeId(id)}
              />
            )
          ) : activeNav === 'settings' ? (
            <SettingsView />
          ) : (
            <div className="card-soft-base bg-theme-card border border-theme-border p-12 text-center text-theme-text-muted font-mono text-xs max-w-md mx-auto mt-12 flex flex-col items-center gap-4">
              <AlertCircle className="h-8 w-8 text-theme-accent animate-pulse" />
              <span>The "{activeNav.toUpperCase()}" view is a placeholder in this structural shell phase.</span>
            </div>
          )}
        </main>
      </div>

      {showBriefing && <ShiftBriefingModal onClose={() => setShowBriefing(false)} />}
      {delayedShowEscalation && (
        <UnifiedIncidentPanel
          zoneId={primaryEscalation.zoneId}
          zoneName={primaryEscalation.zoneName}
          riskScore={primaryEscalation.score}
          riskLevel={primaryEscalation.riskLevel}
          triggeredRules={primaryEscalation.triggeredRules}
          explanation={primaryEscalation.explanation}
          virtualTime={playback.virtualTime!}
          plantId={activePlantId}
          onAcknowledge={handleAcknowledgeEscalation}
        />
      )}
      </div>
    </CameraProvider>
  );
}

export default function App() {
  return (
    <PlantProvider>
      <DashboardContent />
    </PlantProvider>
  );
}
