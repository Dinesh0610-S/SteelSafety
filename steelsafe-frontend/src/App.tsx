import { useState, useEffect, useCallback } from 'react';
import { usePlayback } from './hooks/usePlayback';
import { usePlantData } from './hooks/usePlantData';
import { PlantHeatmap } from './components/PlantHeatmap';
import { RiskTimelineChart } from './components/RiskTimelineChart';
import { DetailPanel } from './components/DetailPanel';
import { PlaybackControls } from './components/PlaybackControls';
import { ChatPanel } from './components/ChatPanel';
import { EmergencyOrchestrator } from './components/EmergencyOrchestrator';
import { PitchMetricsPanel } from './components/PitchMetricsPanel';
import { PlantHeatmap3D } from './components/PlantHeatmap3D';
import { CCTVPanel } from './components/CCTVPanel';
import type { PPEViolationEvent } from './components/CCTVPanel';
import { CompliancePanel } from './components/CompliancePanel';
import { PlantSwitcher } from './components/PlantSwitcher';
import { CrossPlantSummary } from './components/CrossPlantSummary';
import { MainOfficePanel } from './components/MainOfficePanel';
import { ShiftBriefingModal } from './components/ShiftBriefingModal';
import { PlantProvider, usePlant } from './context/PlantContext';
import { Shield, AlertCircle, RefreshCw, Sun, Moon, Building2, FileText } from 'lucide-react';


function DashboardContent() {
  const { activePlantId, activePlant } = usePlant();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [activeTab, setActiveTab] = useState<'cross-plant' | 'safety' | 'compliance' | 'office'>('cross-plant');
  const [liveDetailOverride, setLiveDetailOverride] = useState<any | null>(null);
  const [showBriefing, setShowBriefing] = useState(false);

  // PPE violation state — polled from backend every 3 s
  const [ppeViolations, setPpeViolations] = useState<PPEViolationEvent[]>([]);
  const [ppeOpenCount, setPpeOpenCount] = useState<number>(0);

  // Theme support with persistence and system defaults
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {
      // In sandbox/iframe (e.g. Claude artifact), localStorage may throw SecurityError
    }
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
      try {
        localStorage.setItem('theme', next);
      } catch (e) {}
      return next;
    });
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Poll PPE violations every 3 s for the Main Office tab
  const fetchViolations = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/risk/ppe/violations?limit=100');
      if (res.ok) {
        const data: PPEViolationEvent[] = await res.json();
        setPpeViolations(data);
        setPpeOpenCount(data.filter(v => v.status === 'open').length);
      }
    } catch (_) {}
  }, []);

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
    // Optimistically prepend to local list, then re-fetch
    setPpeViolations(prev => [event, ...prev]);
    setPpeOpenCount(c => c + 1);
  }, []);

  const handleSelectZone = (zoneId: string | null) => {
    setSelectedZoneId(zoneId);
    setLiveDetailOverride(null); // clear override on zone change
  };

  const handleLiveRiskUpdate = (liveRisk: any) => {
    if (!liveRisk) return;
    setLiveDetailOverride({
      sensor: plantData.zoneDetail?.sensor ?? null,
      activePermits: plantData.zoneDetail?.activePermits ?? [],
      workerCount: plantData.zoneDetail?.workerCount ?? 0,
      explanation: liveRisk.explanation,
      riskScore: liveRisk.risk_score,
      riskLevel: liveRisk.risk_level,
      triggeredRules: liveRisk.triggered_rules,
      intervention: plantData.zoneDetail?.intervention ?? null,
      costImpact: liveRisk.cost_impact ?? null,
      signalSnapshot: liveRisk.signal_snapshot ? JSON.parse(liveRisk.signal_snapshot) : null,
    });
  };

  // Load telemetry sync and playback states (scoped to activePlantId)
  const {
    t0Str,
    loading,
    error,
    setT0Str,
  } = usePlantData(null, selectedZoneId, activePlantId);

  // Pass setT0Str to handle regenerate callbacks
  const playback = usePlayback(t0Str, () => {
    // on playback reset, clear selections
    handleSelectZone(null);
  });

  // Re-hook plant data to react to the running virtual clock
  const plantData = usePlantData(playback.virtualTime, selectedZoneId, activePlantId);

  const getActiveAlerts = () => {
    return Object.entries(plantData.currentRisks)
      .filter(([_, r]) => r.risk_level === 'critical')
      .map(([id, r]) => ({
        zoneId: id,
        zoneName: plantData.zoneNames[id] || id,
        score: r.risk_score,
        triggeredRules: r.triggered_rules,
        explanation: r.explanation
      }));
  };

  const getActiveAlertCount = () => {
    return Object.values(plantData.currentRisks).filter(
      (r) => r.risk_level === 'high' || r.risk_level === 'critical'
    ).length;
  };

  const handleRegenerateComplete = (newT0Str: string) => {
    setT0Str(newT0Str);
    plantData.setT0Str(newT0Str);
  };

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

  const selectedZoneName = selectedZoneId ? (plantData.zoneNames[selectedZoneId] || selectedZoneId) : 'No Zone Selected';

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text flex flex-col font-sans antialiased bg-grid-pattern transition-colors duration-300">
      {/* Premium Navigation Header */}
      <header className="border-b border-theme-border bg-theme-card/75 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-theme-accent-bg border border-theme-accent-light shadow-inner flex items-center justify-center">
              <Shield className="h-6 w-6 text-theme-accent" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-theme-text m-0 flex items-center gap-2 leading-none">
                SteelSafe Intelligence
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-theme-accent-light bg-theme-accent-bg text-theme-accent font-bold uppercase tracking-wider">
                  Multi-Plant Console
                </span>
              </h1>
              <span className="text-[10px] text-theme-text-muted font-bold font-mono mt-1 block">
                {activePlant ? activePlant.name : 'Industrial Safety Intelligence'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-2xl bg-theme-card border border-theme-border text-theme-text-secondary hover:bg-theme-card-hover shadow-sm active:scale-[0.98] transition-all flex items-center justify-center"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-theme-accent" />}
            </button>

            {/* Shift Briefing Report */}
            <button
              onClick={() => setShowBriefing(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-theme-card border border-theme-border text-theme-text-secondary hover:bg-theme-card-hover shadow-sm active:scale-[0.98] transition-all text-[10px] font-bold font-mono uppercase tracking-wide"
              title="Generate shift handover safety briefing"
            >
              <FileText className="h-3.5 w-3.5" />
              Shift Briefing
            </button>

            <PlantSwitcher onSwitch={() => handleSelectZone(null)} />

            {/* Live Indicator / Active Alerts badge */}
            <div className="flex items-center gap-2 bg-theme-card border border-theme-border px-3 py-2.5 rounded-2xl text-xs font-mono font-bold shadow-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${getActiveAlertCount() > 0 ? 'bg-theme-risk-crit animate-ping' : 'bg-theme-risk-low animate-pulse'}`} />
              <span className="text-theme-text-secondary">
                {getActiveAlertCount() > 0 ? `${getActiveAlertCount()} ACTIVE ALERTS` : 'SYSTEM STABLE'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="max-w-7xl w-full mx-auto px-6 pt-6 flex gap-2">
        <button
          onClick={() => setActiveTab('cross-plant')}
          className={`px-4 py-2 text-xs font-bold font-mono tracking-wider uppercase rounded-full transition-all ${
            activeTab === 'cross-plant'
              ? 'bg-theme-accent text-white shadow-lg shadow-theme-accent/25'
              : 'bg-theme-card border border-theme-border text-theme-text-secondary hover:text-theme-text hover:bg-theme-card-hover'
          }`}
        >
          Cross-Plant Overview
        </button>
        <button
          onClick={() => setActiveTab('safety')}
          className={`px-4 py-2 text-xs font-bold font-mono tracking-wider uppercase rounded-full transition-all ${
            activeTab === 'safety'
              ? 'bg-theme-accent text-white shadow-lg shadow-theme-accent/25'
              : 'bg-theme-card border border-theme-border text-theme-text-secondary hover:text-theme-text hover:bg-theme-card-hover'
          }`}
        >
          Safety & Telemetry Monitor
        </button>
        <button
          onClick={() => setActiveTab('compliance')}
          className={`px-4 py-2 text-xs font-bold font-mono tracking-wider uppercase rounded-full transition-all flex items-center gap-1.5 ${
            activeTab === 'compliance'
              ? 'bg-theme-accent text-white shadow-lg shadow-theme-accent/25'
              : 'bg-theme-card border border-theme-border text-theme-text-secondary hover:text-theme-text hover:bg-theme-card-hover'
          }`}
        >
          Quality & Compliance Audit
          <span className="text-[8px] bg-theme-risk-crit-bg border border-theme-risk-crit-border text-theme-risk-crit-text px-1.5 py-0.5 rounded-full font-black font-mono">
            LIVE
          </span>
        </button>
        <button
          onClick={() => setActiveTab('office')}
          className={`px-4 py-2 text-xs font-bold font-mono tracking-wider uppercase rounded-full transition-all flex items-center gap-1.5 ${
            activeTab === 'office'
              ? 'bg-theme-accent text-white shadow-lg shadow-theme-accent/25'
              : 'bg-theme-card border border-theme-border text-theme-text-secondary hover:text-theme-text hover:bg-theme-card-hover'
          }`}
        >
          <Building2 className="h-3 w-3" />
          Main Office
          {ppeOpenCount > 0 && (
            <span className="h-4 w-4 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center animate-pulse">
              {ppeOpenCount}
            </span>
          )}
        </button>
      </div>

      {/* Main Dashboard Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 flex flex-col gap-6">
        {activeTab === 'cross-plant' ? (
          <CrossPlantSummary onFocusPlant={() => setActiveTab('safety')} />
        ) : activeTab === 'compliance' ? (
          <CompliancePanel />
        ) : activeTab === 'office' ? (
          <MainOfficePanel
            violations={ppeViolations}
            onAcknowledge={handleAcknowledgeViolation}
            onResolve={handleResolveViolation}
            onRefresh={fetchViolations}
          />
        ) : (
          <>
            {/* Pitch Metrics Summary panel at the very top */}
            <PitchMetricsPanel comparisonMetrics={plantData.comparisonMetrics} />
        
            {/* Layout Row: Heatmap (Left) + Detail Panel (Middle) + Chat Panel (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch">
              <div className="lg:col-span-2 flex flex-col gap-4">
                {/* View Mode Toggle Header */}
                <div className="flex bg-theme-card/70 p-1 rounded-full border border-theme-border self-start gap-1 shadow-sm">
                  <button
                    onClick={() => setViewMode('2d')}
                    className={`text-[10px] font-bold px-4 py-1.5 rounded-full transition-all ${
                      viewMode === '2d'
                        ? 'bg-theme-accent text-white shadow-sm shadow-theme-accent/20'
                        : 'text-theme-text-secondary hover:text-theme-text'
                    }`}
                  >
                    2D Floor Plan
                  </button>
                  <button
                    onClick={() => setViewMode('3d')}
                    className={`text-[10px] font-bold px-4 py-1.5 rounded-full transition-all ${
                      viewMode === '3d'
                        ? 'bg-theme-accent text-white shadow-sm shadow-theme-accent/20'
                        : 'text-theme-text-secondary hover:text-theme-text'
                    }`}
                  >
                    3D WebGL Model
                  </button>
                </div>

                {viewMode === '2d' ? (
                  <PlantHeatmap
                    currentRisks={plantData.currentRisks}
                    selectedZoneId={selectedZoneId}
                    onSelectZone={handleSelectZone}
                  />
                ) : (
                  <PlantHeatmap3D
                    currentRisks={plantData.currentRisks}
                    selectedZoneId={selectedZoneId}
                    onSelectZone={handleSelectZone}
                  />
                )}

                {/* Live CCTV Bounding Box Camera Panel */}
                <CCTVPanel
                  selectedZoneId={selectedZoneId}
                  onLiveRiskUpdate={handleLiveRiskUpdate}
                  onPPEViolation={handlePPEViolation}
                  activePlantId={activePlantId}
                />
              </div>
              <div className="lg:col-span-1">
                <DetailPanel
                  zoneId={selectedZoneId}
                  zoneName={selectedZoneName}
                  detail={liveDetailOverride ?? plantData.zoneDetail}
                />
              </div>
              <div className="lg:col-span-1">
                <ChatPanel
                  selectedZoneId={selectedZoneId}
                  selectedZoneName={selectedZoneName}
                />
              </div>
            </div>

            {/* Emergency Orchestrator Evacuation Siren & Report Drawer */}
            <EmergencyOrchestrator
              activeAlerts={getActiveAlerts()}
              virtualTime={playback.virtualTime}
            />

            {/* Lower Row: Playback Controls + Historical Chart */}
            <div className="flex flex-col gap-6">
              <PlaybackControls
                virtualTime={playback.virtualTime}
                isPlaying={playback.isPlaying}
                speed={playback.speed}
                progressFraction={playback.progressFraction}
                t0={playback.t0}
                t8={playback.t8}
                onTogglePlay={playback.togglePlay}
                onSetSpeed={playback.setSpeed}
                onSeek={playback.seekTo}
                onReset={playback.resetTime}
                onRegenerateComplete={handleRegenerateComplete}
              />

              {selectedZoneId && (
                <div className="animate-fadeIn">
                  <RiskTimelineChart
                    selectedZoneId={selectedZoneId}
                    selectedZoneName={selectedZoneName}
                    history={plantData.selectedZoneHistory}
                    t0={playback.t0}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Phase 9: Shift Briefing Modal */}
      {showBriefing && (
        <ShiftBriefingModal onClose={() => setShowBriefing(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <PlantProvider>
      <DashboardContent />
    </PlantProvider>
  );
}
