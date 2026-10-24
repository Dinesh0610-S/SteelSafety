import { useState, useEffect, useMemo } from 'react';
import {
  Cpu, Network, Edit2, Settings2, CheckCircle2, AlertTriangle
} from 'lucide-react';
import { usePlant } from '../context/PlantContext';

interface DeviceItem {
  id: string;
  name: string;
  type: 'Camera' | 'Sensor' | 'Edge Gateway';
  isReal: boolean;
  ip: string;
  status: 'Online' | 'Offline';
  health: number;
  value: string;
  zone: string;
}

export function DevicesView() {
  const { activePlantId: _activePlantId } = usePlant();

  const devices = useMemo<DeviceItem[]>(() => {
    return [
      { id: 'CAM01', name: 'CAM 01 - Coke Oven Battery', type: 'Camera', isReal: true, ip: '192.168.1.101', status: 'Online', health: 99, value: 'Laptop Webcam', zone: 'Coke Oven Battery' },
      { id: 'CAM02', name: 'CAM 02 - Blast Furnace Zone', type: 'Camera', isReal: false, ip: '192.168.1.102', status: 'Online', health: 95, value: 'AI Camera - Recorded Feed', zone: 'Blast Furnace Zone' },
      { id: 'CAM03', name: 'CAM 03 - Gas Cleaning Plant', type: 'Camera', isReal: false, ip: '192.168.1.103', status: 'Online', health: 94, value: 'AI Camera - Recorded Feed', zone: 'Gas Cleaning Plant' },
      { id: 'SENSOR01', name: 'Gas Sensor - Multi Gas CO/H2S', type: 'Sensor', isReal: false, ip: '192.168.1.201', status: 'Online', health: 98, value: 'Normal', zone: 'Coke Oven Battery' },
      { id: 'SENSOR02', name: 'Thermal Sensor - Core Battery', type: 'Sensor', isReal: false, ip: '192.168.1.202', status: 'Online', health: 97, value: 'Normal', zone: 'Blast Furnace Zone' },
      { id: 'EDGE01', name: 'Jetson Edge Gateway', type: 'Edge Gateway', isReal: false, ip: '192.168.1.254', status: 'Online', health: 99, value: 'Active', zone: 'Control Center' },
    ];
  }, []);

  const [notification, setNotification] = useState<string | null>(null);

  // CPU/Memory illustrative resources
  const [resourceMetrics, setResourceMetrics] = useState({
    cpu: 45,
    mem: 52,
    disk: 36,
    ping: 18
  });

  // Slowly fluctuate resource metrics for realism
  useEffect(() => {
    const interval = setInterval(() => {
      setResourceMetrics(prev => ({
        cpu: Math.max(35, Math.min(65, prev.cpu + (Math.random() > 0.5 ? 2 : -2))),
        mem: Math.max(48, Math.min(58, prev.mem + (Math.random() > 0.5 ? 1 : -1))),
        disk: prev.disk,
        ping: Math.max(12, Math.min(24, prev.ping + (Math.random() > 0.5 ? 1 : -1)))
      }));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const topStats = useMemo(() => {
    const cameras = devices.filter(d => d.type === 'Camera');
    const onlineCam = cameras.filter(d => d.status === 'Online').length;
    const offlineCam = cameras.filter(d => d.status === 'Offline').length;
    const sensorsCount = devices.filter(d => d.type === 'Sensor').length;
    
    return {
      connected: onlineCam,
      offline: offlineCam,
      edge: 1, // Jetson Edge Gateway
      sensors: sensorsCount
    };
  }, [devices]);

  const triggerConfigAlert = (name: string) => {
    setNotification(`Configuration menu opened for ${name}`);
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div id="devices-view-container" className="flex flex-col gap-6 w-full text-theme-text">
      
      {/* Header Panel */}
      <div className="flex flex-col leading-tight">
        <h2 className="text-xl font-black tracking-tight text-theme-text m-0">6. DEVICES</h2>
        <p className="text-[11px] text-theme-text-muted font-bold mt-1.5">Manage and monitor all devices and cameras</p>
      </div>

      {/* Top stats row: 4 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Connected Cameras */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-theme-text-muted uppercase tracking-widest">Connected Cameras</span>
            <div className="p-1.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-xl font-black text-theme-text leading-none">{topStats.connected}</span>
            <span className="text-[7.5px] font-bold uppercase mt-1.5 text-emerald-400">Online</span>
          </div>
        </div>

        {/* Offline Cameras */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-theme-text-muted uppercase tracking-widest">Offline Cameras</span>
            <div className="p-1.5 rounded-lg bg-red-950/20 border border-red-500/20 text-red-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-xl font-black text-theme-text leading-none">{topStats.offline}</span>
            <span className="text-[7.5px] font-bold uppercase mt-1.5 text-red-400">Offline</span>
          </div>
        </div>

        {/* Edge Devices */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-theme-text-muted uppercase tracking-widest">Edge Devices</span>
            <div className="p-1.5 rounded-lg bg-blue-950/20 border border-blue-500/20 text-blue-400">
              <Cpu className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-xl font-black text-theme-text leading-none">{topStats.edge}</span>
            <span className="text-[7.5px] font-bold uppercase mt-1.5 text-blue-400">Online</span>
          </div>
        </div>

        {/* Sensors */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-theme-text-muted uppercase tracking-widest">Sensors</span>
            <div className="p-1.5 rounded-lg bg-cyan-950/20 border border-cyan-500/20 text-cyan-400">
              <Network className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-xl font-black text-theme-text leading-none">{topStats.sensors}</span>
            <span className="text-[7.5px] font-bold uppercase mt-1.5 text-cyan-400">Online</span>
          </div>
        </div>

      </div>

      {/* Device table */}
      <div className="bg-theme-card border border-theme-border rounded-3xl overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-theme-border bg-theme-bg-alt text-[9px] font-black text-theme-text-muted uppercase tracking-widest">
                <th className="p-4 pl-6">Device Name</th>
                <th className="p-4">Type</th>
                <th className="p-4">IP Address</th>
                <th className="p-4">Status</th>
                <th className="p-4">Health</th>
                <th className="p-4">FPS / Value</th>
                <th className="p-4">Zone</th>
                <th className="p-4 pr-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border text-xs font-semibold">
              {devices.map(dev => (
                <tr key={dev.id} className="hover:bg-theme-card-hover/20 transition-all">
                  <td className="p-4 pl-6 flex items-center gap-2">
                    <span className="font-extrabold text-theme-text">{dev.name}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-theme-text-secondary">{dev.type}</span>
                      {dev.isReal ? (
                        <span className="px-1.5 py-0.5 rounded text-[7px] font-black font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                          Real Hardware
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[7px] font-black font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
                          Simulated
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 font-mono text-[10px] text-theme-text-muted">{dev.ip}</td>
                  <td className="p-4">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${dev.status === 'Online' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {dev.status}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-theme-text-secondary">{dev.health}%</td>
                  <td className="p-4 font-mono text-theme-text-secondary">{dev.value}</td>
                  <td className="p-4 text-theme-text-secondary">{dev.zone}</td>
                  <td className="p-4 pr-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => triggerConfigAlert(dev.name)}
                        className="p-1.5 rounded-lg hover:bg-theme-card-hover text-theme-text-muted hover:text-theme-text transition-all"
                        title="Configure device parameters"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => triggerConfigAlert(dev.name)}
                        className="p-1.5 rounded-lg hover:bg-theme-card-hover text-theme-text-muted hover:text-theme-text transition-all"
                        title="View diagnostic settings"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Row: Factory map floorplan layout + Resource Health overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        
        {/* Factory Layout position map */}
        <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Factory Layout</h3>
          
          <div className="relative flex-1 min-h-[160px] bg-theme-well border border-theme-border rounded-2xl flex items-center justify-center p-4">
            <svg className="w-full max-w-[420px] aspect-[2/1] opacity-75" viewBox="0 0 200 100">
              {/* Styled Outline Grid Floorplan */}
              <rect x="5" y="5" width="190" height="90" rx="4" fill="none" stroke="#1e293b" strokeWidth="1" />
              <line x1="60" y1="5" x2="60" y2="95" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1="120" y1="5" x2="120" y2="95" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1="5" y1="50" x2="195" y2="50" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="3 3" />
              
              {/* Zones labels */}
              <text x="30" y="30" fill="#475569" fontSize="6" fontWeight="bold" textAnchor="middle">ENTRANCE</text>
              <text x="90" y="30" fill="#475569" fontSize="6" fontWeight="bold" textAnchor="middle">ASSEMBLY</text>
              <text x="160" y="30" fill="#475569" fontSize="6" fontWeight="bold" textAnchor="middle">WAREHOUSE</text>
              <text x="30" y="75" fill="#475569" fontSize="6" fontWeight="bold" textAnchor="middle">BOILER</text>
              <text x="90" y="75" fill="#475569" fontSize="6" fontWeight="bold" textAnchor="middle">ROBOT ZONE</text>
              <text x="160" y="75" fill="#475569" fontSize="6" fontWeight="bold" textAnchor="middle">LOADING BAY</text>

              {/* Cameras & sensors placement nodes (CAM 01 - CAM 03) */}
              {/* CAM 01 (Coke Oven Battery - LIVE LAPTOP WEBCAM) - pulsing bright green */}
              <circle cx="25" cy="25" r="3.5" fill="#10b981" />
              <circle cx="25" cy="25" r="6" fill="none" stroke="#10b981" strokeWidth="1" className="animate-ping opacity-60" />
              <text x="25" y="18" fill="#10b981" fontSize="4.5" fontWeight="black" textAnchor="middle">C01</text>
              
              {/* CAM 02 (Blast Furnace Zone - Recorded Feed) - Green */}
              <circle cx="95" cy="25" r="3" fill="#10b981" />
              <text x="95" y="18" fill="#10b981" fontSize="4.5" fontWeight="black" textAnchor="middle">C02</text>
              
              {/* CAM 03 (Gas Cleaning Plant - Recorded Feed) - Green */}
              <circle cx="165" cy="25" r="3" fill="#10b981" />
              <text x="165" y="18" fill="#10b981" fontSize="4.5" fontWeight="black" textAnchor="middle">C03</text>
            </svg>
          </div>
        </div>

        {/* Device Health Overview (Resource metrics) */}
        <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Device Health Overview</h3>
          
          <div className="flex-1 flex flex-col sm:flex-row items-center gap-6 mt-1">
            
            {/* Health rating meter gauge */}
            <div className="relative h-28 w-28 shrink-0 flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                <circle cx="56" cy="56" r="48" className="stroke-theme-well fill-transparent" strokeWidth="8" />
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  className="stroke-emerald-500 fill-transparent transition-all duration-500"
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 48}
                  strokeDashoffset={(2 * Math.PI * 48) - (0.93 * 2 * Math.PI * 48)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-theme-text leading-none">93%</span>
                <span className="text-[7.5px] font-bold text-emerald-400 uppercase tracking-widest mt-1">Healthy</span>
              </div>
            </div>

            {/* Health Bars */}
            <div className="flex-1 w-full flex flex-col gap-3">
              
              {/* CPU */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-theme-text-muted">
                  <span>CPU Usage</span>
                  <span className="text-theme-text">{resourceMetrics.cpu}%</span>
                </div>
                <div className="h-1.5 bg-theme-bg border border-theme-border rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${resourceMetrics.cpu}%` }} />
                </div>
              </div>

              {/* Memory */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-theme-text-muted">
                  <span>Memory Usage</span>
                  <span className="text-theme-text">{resourceMetrics.mem}%</span>
                </div>
                <div className="h-1.5 bg-theme-bg border border-theme-border rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${resourceMetrics.mem}%` }} />
                </div>
              </div>

              {/* Storage */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-theme-text-muted">
                  <span>Storage Usage</span>
                  <span className="text-theme-text">{resourceMetrics.disk}%</span>
                </div>
                <div className="h-1.5 bg-theme-bg border border-theme-border rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${resourceMetrics.disk}%` }} />
                </div>
              </div>

              {/* Ping Network latency */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-theme-text-muted">
                  <span>Network Latency</span>
                  <span className="text-theme-text">{resourceMetrics.ping} ms</span>
                </div>
                <div className="h-1.5 bg-theme-bg border border-theme-border rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${(resourceMetrics.ping / 40) * 100}%` }} />
                </div>
              </div>

            </div>

          </div>
        </div>

      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-theme-card border border-theme-border px-4 py-3 rounded-2xl shadow-2xl animate-slideIn">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
          <span className="text-xs font-bold text-theme-text">{notification}</span>
        </div>
      )}

    </div>
  );
}
