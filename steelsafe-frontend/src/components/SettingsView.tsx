import { useState, useEffect } from 'react';
import {
  Settings, ToggleLeft, ToggleRight, CheckCircle2, Sliders, Clock
} from 'lucide-react';

interface SystemSettings {
  confidenceThreshold: number;
  alertDelay: number;
  enableFall: boolean;
  enableSmoke: boolean;
  enablePpe: boolean;
  enableRestricted: boolean;
  enableVehicle: boolean;
  delayCritical: number;
  delayHigh: number;
  delayMedium: number;
  delayLow: number;
}

const DEFAULT_SETTINGS: SystemSettings = {
  confidenceThreshold: 70,
  alertDelay: 5,
  enableFall: false,
  enableSmoke: true,
  enablePpe: true,
  enableRestricted: true,
  enableVehicle: false,
  delayCritical: 0,
  delayHigh: 5,
  delayMedium: 10,
  delayLow: 30
};

export function SettingsView() {
  const [activeTab, setActiveTab] = useState('AI Settings');
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [notification, setNotification] = useState<string | null>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('steelsafe_settings');
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch (_) {}
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('steelsafe_settings', JSON.stringify(settings));
    setNotification("Settings saved and applied to live system.");
    setTimeout(() => setNotification(null), 3000);
  };

  const updateSetting = (key: keyof SystemSettings, val: any) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div id="settings-view-container" className="flex flex-col gap-6 w-full text-slate-100">
      
      {/* Header Panel */}
      <div className="flex flex-col leading-tight">
        <h2 className="text-xl font-black tracking-tight text-white m-0">9. SETTINGS</h2>
        <p className="text-[11px] text-slate-400 font-bold mt-1.5">Configure system preferences and setup</p>
      </div>

      {/* Main Grid: Left tabs + Middle content + Right priorities */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-stretch">
        
        {/* Left Side: Navigation Links */}
        <div className="xl:col-span-1 bg-[#111622]/60 border border-[#1f293d] rounded-3xl p-5 flex flex-col gap-4 shadow-sm">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-2 border-b border-slate-800">Menu</h3>
          
          <div className="flex flex-col gap-1.5">
            {[
              'AI Settings',
              'Camera Settings',
              'Notification Settings',
              'User Management',
              'Security Settings',
              'System Logs',
              'General Settings',
              'Integration'
            ].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === tab
                    ? 'bg-[#10b981]/10 text-emerald-400 border border-[#10b981]/20 shadow-sm'
                    : 'text-slate-400 hover:bg-[#141b2c]/60 hover:text-white border border-transparent'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Middle Area: Settings Controls */}
        <div className="xl:col-span-2 bg-[#111622] border border-[#1f293d] rounded-3xl p-6 flex flex-col justify-between shadow-md relative">
          
          <div className="flex flex-col gap-6">
            <h4 className="text-sm font-black text-white uppercase tracking-wider border-b border-slate-800/80 pb-3 flex items-center gap-2">
              <Sliders className="h-4.5 w-4.5 text-emerald-400" />
              {activeTab} Settings
            </h4>

            {activeTab !== 'AI Settings' ? (
              <div className="p-8 text-center text-slate-400 text-xs font-semibold leading-relaxed border border-[#1f293d] border-dashed rounded-2xl flex flex-col items-center gap-2">
                <Settings className="h-6 w-6 text-slate-500 animate-spin" />
                <span>The "{activeTab}" subsystem is pre-configured for safety standards. Custom editing is locked.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                
                {/* Confidence threshold slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">Detection Confidence Threshold</span>
                    <span className="text-emerald-400 font-mono">{settings.confidenceThreshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={settings.confidenceThreshold}
                    onChange={(e) => updateSetting('confidenceThreshold', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#141b2c] border border-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <span className="text-[9px] text-slate-500 font-semibold leading-relaxed">
                    Controls the minimum confidence score required for AI detection models to log a person/item violation.
                  </span>
                </div>

                {/* Alert Delay Seconds slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">Alert Delay (Seconds)</span>
                    <span className="text-emerald-400 font-mono">{settings.alertDelay} sec</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={settings.alertDelay}
                    onChange={(e) => updateSetting('alertDelay', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#141b2c] border border-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <span className="text-[9px] text-slate-500 font-semibold leading-relaxed">
                    Stability buffer: number of consecutive seconds a violation must persist before raising an alert.
                  </span>
                </div>

                <hr className="border-slate-800" />

                {/* Toggles List */}
                <div className="flex flex-col gap-4">
                  
                  {/* Fall Detection (Simulated/Coming Soon) */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-300">Fall Detection</span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Coming Soon</span>
                    </div>
                    <button
                      disabled
                      className="text-slate-600 cursor-not-allowed opacity-50"
                    >
                      <ToggleLeft className="h-7 w-7" />
                    </button>
                  </div>

                  {/* Smoke/Fire Detection */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-300">Smoke/Fire Detection</span>
                      <span className="text-[9px] text-slate-500 font-semibold mt-0.5">Alerts when thermal or gas baseline index is breached.</span>
                    </div>
                    <button
                      onClick={() => updateSetting('enableSmoke', !settings.enableSmoke)}
                      className="text-slate-300 hover:text-white transition-all"
                    >
                      {settings.enableSmoke ? (
                        <ToggleRight className="h-7 w-7 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-7 w-7 text-slate-500" />
                      )}
                    </button>
                  </div>

                  {/* PPE Detection */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-300">PPE Detection</span>
                      <span className="text-[9px] text-slate-500 font-semibold mt-0.5">Monitors workers for missing safety helmets or safety vests.</span>
                    </div>
                    <button
                      onClick={() => updateSetting('enablePpe', !settings.enablePpe)}
                      className="text-slate-300 hover:text-white transition-all"
                    >
                      {settings.enablePpe ? (
                        <ToggleRight className="h-7 w-7 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-7 w-7 text-slate-500" />
                      )}
                    </button>
                  </div>

                  {/* Restricted Area Detection */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-300">Restricted Area Detection</span>
                      <span className="text-[9px] text-slate-500 font-semibold mt-0.5">Monitors boundary entry and confined space compliance.</span>
                    </div>
                    <button
                      onClick={() => updateSetting('enableRestricted', !settings.enableRestricted)}
                      className="text-slate-300 hover:text-white transition-all"
                    >
                      {settings.enableRestricted ? (
                        <ToggleRight className="h-7 w-7 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-7 w-7 text-slate-500" />
                      )}
                    </button>
                  </div>

                  {/* Vehicle Detection (Coming Soon) */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-300">Vehicle Detection</span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Coming Soon</span>
                    </div>
                    <button
                      disabled
                      className="text-slate-600 cursor-not-allowed opacity-50"
                    >
                      <ToggleLeft className="h-7 w-7" />
                    </button>
                  </div>

                </div>

              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black rounded-xl transition-all shadow-md"
            >
              Save Changes
            </button>
          </div>
        </div>

        {/* Right Side: Alert Priorities Config */}
        <div className="xl:col-span-1 bg-[#111622] border border-[#1f293d] rounded-3xl p-5 flex flex-col gap-4 shadow-md">
          <h4 className="text-xs uppercase font-extrabold tracking-widest text-slate-400 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-emerald-400" />
            Alert Priorities
          </h4>
          
          <div className="flex flex-col gap-4 mt-2">
            
            {/* Critical */}
            <div className="flex flex-col gap-1.5 p-3.5 bg-[#141b2c]/60 border border-slate-800 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[8px] font-black font-mono uppercase bg-red-500/10 text-red-400 border border-red-500/20">
                  Critical
                </span>
                <span className="text-[9px] font-bold text-slate-500">Immediate</span>
              </div>
              <p className="text-[8.5px] text-slate-400 m-0 mt-1 font-semibold leading-normal">
                Breaches trigger alarms instantly with no validation delay.
              </p>
            </div>

            {/* High */}
            <div className="flex flex-col gap-1.5 p-3.5 bg-[#141b2c]/60 border border-slate-800 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[8px] font-black font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  High
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={settings.delayHigh}
                    onChange={(e) => updateSetting('delayHigh', parseInt(e.target.value) || 0)}
                    className="w-10 bg-[#0c101b] border border-slate-800 rounded px-1 text-[10px] font-mono text-center font-bold text-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[9px] font-bold text-slate-500">sec</span>
                </div>
              </div>
              <p className="text-[8.5px] text-slate-400 m-0 mt-1 font-semibold leading-normal">
                Timing delay before escalating severe safety deviations.
              </p>
            </div>

            {/* Medium */}
            <div className="flex flex-col gap-1.5 p-3.5 bg-[#141b2c]/60 border border-slate-800 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[8px] font-black font-mono uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Medium
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={settings.delayMedium}
                    onChange={(e) => updateSetting('delayMedium', parseInt(e.target.value) || 0)}
                    className="w-10 bg-[#0c101b] border border-slate-800 rounded px-1 text-[10px] font-mono text-center font-bold text-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[9px] font-bold text-slate-500">sec</span>
                </div>
              </div>
              <p className="text-[8.5px] text-slate-400 m-0 mt-1 font-semibold leading-normal">
                Standard warning check delay period for minor deviations.
              </p>
            </div>

            {/* Low */}
            <div className="flex flex-col gap-1.5 p-3.5 bg-[#141b2c]/60 border border-slate-800 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[8px] font-black font-mono uppercase bg-slate-500/20 text-slate-400 border border-slate-800">
                  Low
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={settings.delayLow}
                    onChange={(e) => updateSetting('delayLow', parseInt(e.target.value) || 0)}
                    className="w-10 bg-[#0c101b] border border-slate-800 rounded px-1 text-[10px] font-mono text-center font-bold text-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[9px] font-bold text-slate-500">sec</span>
                </div>
              </div>
              <p className="text-[8.5px] text-slate-400 m-0 mt-1 font-semibold leading-normal">
                Handover check notification delays.
              </p>
            </div>

          </div>
        </div>

      </div>

      {/* SUCCESS TOAST OVERLAY */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-[#111622] border border-[#1f293d] px-4 py-3 rounded-2xl shadow-2xl animate-slideIn">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
          <span className="text-xs font-bold text-slate-200">{notification}</span>
        </div>
      )}

    </div>
  );
}
