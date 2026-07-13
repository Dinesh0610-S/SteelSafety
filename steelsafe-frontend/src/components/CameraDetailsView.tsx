import { useEffect, useMemo, useRef } from 'react';
import {
  ChevronRight, Play, Pause, Video, VideoOff, RefreshCw, AlertTriangle, Cpu
} from 'lucide-react';
import type { PPEViolationEvent } from './CCTVPanel';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { useCamera, drawPredictions } from '../context/CameraContext';

interface CameraDetailsViewProps {
  cameraId: string;
  violations: PPEViolationEvent[];
  deviations: any[];
  onBack: () => void;
}

const CAMERA_INFO_MAP: Record<string, { name: string; ip: string; zone: string; isWebcam: boolean }> = {
  // Coke Oven Battery (plant_a)
  "zone_cob1": { name: "CAM 01 - Coke Oven Battery 1", ip: "192.168.1.101", zone: "Coke Oven Battery 1", isWebcam: true },
  "zone_gcm": { name: "CAM 02 - Gas Collection Main", ip: "192.168.1.102", zone: "Gas Collection Main", isWebcam: false },
  "zone_qt": { name: "CAM 03 - Quenching Tower", ip: "192.168.1.103", zone: "Quenching Tower", isWebcam: false },
  "zone_ca": { name: "CAM 04 - Charging Area", ip: "192.168.1.104", zone: "Charging Area", isWebcam: false },
  "zone_cr": { name: "CAM 05 - Control Room", ip: "192.168.1.105", zone: "Control Room", isWebcam: false },
  // Rolling Mill Complex (plant_b)
  "zone_rhf": { name: "CAM 01 - Reheating Furnace", ip: "192.168.2.101", zone: "Reheating Furnace", isWebcam: false },
  "zone_rs": { name: "CAM 02 - Rolling Stand", ip: "192.168.2.102", zone: "Rolling Stand", isWebcam: false },
  "zone_cb": { name: "CAM 03 - Cooling Bed", ip: "192.168.2.103", zone: "Cooling Bed", isWebcam: false },
  "zone_fl": { name: "CAM 04 - Finishing Line", ip: "192.168.2.104", zone: "Finishing Line", isWebcam: false },
  "zone_cr2": { name: "CAM 05 - Mill Control Room", ip: "192.168.2.105", zone: "Mill Control Room", isWebcam: false },
};

export function CameraDetailsView({ cameraId, violations, deviations, onBack }: CameraDetailsViewProps) {
  const {
    webcamActive,
    stream,
    detecting,
    cameraFps,
    predictions,
    realCamZone,
    startCamera,
    stopCamera
  } = useCamera();

  const isWebcam = cameraId === realCamZone;

  const camInfo = useMemo(() => {
    const info = CAMERA_INFO_MAP[cameraId] || { name: `CAM: ${cameraId}`, ip: '192.168.1.99', zone: 'Unknown', isWebcam: false };
    return { ...info, isWebcam };
  }, [cameraId, isWebcam]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync stream to local video element
  useEffect(() => {
    if (isWebcam && videoRef.current) {
      videoRef.current.srcObject = stream;
      if (stream) {
        videoRef.current.play().catch(e => console.warn("Failed playing local video in CameraDetails:", e));
      }
    }
  }, [stream, isWebcam]);

  // Canvas drawing loop for live predictions
  useEffect(() => {
    if (!isWebcam || !webcamActive || !videoRef.current || !canvasRef.current) return;
    let animationFrameId: number;
    let isRunning = true;

    const renderLoop = () => {
      if (!isRunning) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
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
  }, [webcamActive, predictions, isWebcam]);

  // Filter alerts specifically for this camera
  const cameraAlerts = useMemo(() => {
    const list: any[] = [];

    violations.forEach(v => {
      if (v.zone_id === cameraId) {
        list.push({
          time: new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'No Helmet/Vest',
          severity: 'High'
        });
      }
    });

    deviations.forEach(d => {
      if (d.zone_id === cameraId) {
        list.push({
          time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: d.category,
          severity: d.severity === 'high' ? 'High' : d.severity === 'critical' ? 'Critical' : 'Medium'
        });
      }
    });

    if (list.length === 0) {
      // Seed nice mock rows if list is empty
      return [
        { time: '10:30 AM', type: 'No Helmet', severity: 'High' },
        { time: '10:21 AM', type: 'No Vest', severity: 'High' },
        { time: '10:15 AM', type: 'No Gloves', severity: 'Medium' }
      ];
    }

    return list;
  }, [violations, deviations, cameraId]);

  // Hourly alert timeline for this specific zone
  const past24HoursData = useMemo(() => {
    const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00', '00:00', '02:00', '04:00', '06:00'];
    const counts = [1, 3, 2, 0, 4, 1, 0, 0, 1, 2, 0, 1];

    // Adjust today's count based on live violations
    counts[1] = Math.max(counts[1], cameraAlerts.length);

    return hours.map((h, i) => ({
      hour: h,
      Alerts: counts[i]
    }));
  }, [cameraAlerts]);

  // Simulated indicators for mock camera view bounding boxes
  const mockCameraWorkers = useMemo(() => {
    if (cameraId === 'zone_cob1') return [{ label: 'Worker: Compliant', x: 'left-[20%] top-[40%] w-[25%] h-[40%]', color: 'border-emerald-500 text-emerald-400' }];
    if (cameraId === 'zone_qt') return [{ label: 'Worker: Compliant', x: 'left-[40%] top-[30%] w-[20%] h-[50%]', color: 'border-emerald-500 text-emerald-400' }];
    if (cameraId === 'zone_ca') return [{ label: 'Operator: Valid Permit', x: 'left-[30%] top-[35%] w-[22%] h-[45%]', color: 'border-emerald-500 text-emerald-400' }];
    if (cameraId === 'zone_cr') return [{ label: 'Target: Area Locked', x: 'left-[45%] top-[40%] w-[18%] h-[35%]', color: 'border-amber-500 text-amber-400' }];
    return [];
  }, [cameraId]);

  return (
    <div id="camera-details-view" className="flex flex-col gap-6 w-full text-slate-100">
      
      {/* Breadcrumb Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          <button onClick={onBack} className="hover:text-emerald-400 transition-all cursor-pointer">
            Live Monitoring
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-300">{camInfo.name}</span>
        </div>

        {camInfo.isWebcam ? (
          <span className="px-2 py-0.5 rounded text-[8px] font-black font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
            Real Hardware
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-[8px] font-black font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
            Simulated Feed
          </span>
        )}
      </div>

      {/* Main Grid: Video + Stats */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-stretch">
        
        {/* Large Live Video Panel */}
        <div className="xl:col-span-2 flex flex-col gap-4 bg-theme-card border border-theme-border rounded-3xl p-5 shadow-md">
          <div className="relative aspect-video rounded-2xl border border-theme-border bg-theme-bg-alt overflow-hidden shadow-inner group">
            {/* Grid overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.35)_95%),linear-gradient(90deg,rgba(18,24,38,0)_95%,rgba(0,0,0,0.35)_95%)] bg-[size:20px_20px] pointer-events-none opacity-30" />

            {!camInfo.isWebcam || !webcamActive ? (
              <div className="absolute inset-0 bg-gradient-to-br from-[#121c33] via-[#090e1a] to-[#070b14] flex flex-col items-center justify-center gap-2">
                <span className="text-[10px] font-mono font-bold text-slate-500 select-none uppercase tracking-widest text-center">
                  {camInfo.isWebcam ? "Real Hardware Camera" : `${camInfo.zone} Live Telemetry View`}
                </span>
                {camInfo.isWebcam && (
                  <span className="text-[8px] font-mono text-slate-600 select-none mb-1">
                    Standby — Inactive
                  </span>
                )}
                {camInfo.isWebcam && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startCamera();
                    }}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl shadow-lg hover:shadow-emerald-500/20 hover:scale-105 active:scale-95 flex items-center gap-1.5 transition-all z-20 cursor-pointer"
                  >
                    <Video className="h-3.5 w-3.5" />
                    Activate Camera
                  </button>
                )}
              </div>
            ) : null}

            {/* Webcam video tracks */}
            {camInfo.isWebcam && (
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute top-0 left-0 w-full h-full object-cover scale-x-[-1] ${webcamActive ? 'block' : 'hidden'}`}
                />
                <canvas
                  ref={canvasRef}
                  className={`absolute top-0 left-0 w-full h-full object-cover scale-x-[-1] ${webcamActive ? 'block' : 'hidden'}`}
                />
                {webcamActive && !detecting && (
                  <div className="absolute inset-0 bg-theme-bg-alt/90 flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
                    <RefreshCw className="h-5 w-5 text-emerald-400 animate-spin" />
                    <span className="text-[8px] font-mono font-bold text-slate-400">Loading AI Bounding Boxes...</span>
                  </div>
                )}
              </div>
            )}

            {/* Simulated Bounding Box for static/simulated cams */}
            {(!camInfo.isWebcam || !webcamActive) && mockCameraWorkers.map((w, idx) => (
              <div key={idx} className={`absolute ${w.x} border-2 ${w.color} rounded-lg flex flex-col justify-between p-1 bg-black/10 backdrop-blur-[0.5px] animate-pulse`}>
                <span className="text-[7.5px] font-bold font-mono px-1 rounded bg-black/60 text-white truncate max-w-full leading-none">
                  {w.label}
                </span>
              </div>
            ))}

            {/* Video Live Badge overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
              <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                (camInfo.isWebcam && webcamActive) || (!camInfo.isWebcam && cameraId !== 'zone_cb')
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  (camInfo.isWebcam && webcamActive) || (!camInfo.isWebcam && cameraId !== 'zone_cb')
                    ? 'bg-emerald-400'
                    : 'bg-red-400'
                }`} />
                {(camInfo.isWebcam && webcamActive) || (!camInfo.isWebcam && cameraId !== 'zone_cb') ? 'Live' : 'Offline'}
              </span>
            </div>

          </div>

          {/* CCTV controls bar */}
          <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 text-slate-400">
            <div className="flex items-center gap-3">
              {camInfo.isWebcam ? (
                <button
                  onClick={webcamActive ? stopCamera : startCamera}
                  className="p-1.5 rounded bg-[#161d2d] hover:bg-slate-800 text-white transition-all text-xs font-black flex items-center gap-1 cursor-pointer"
                >
                  {webcamActive ? <VideoOff className="h-4.5 w-4.5" /> : <Video className="h-4.5 w-4.5" />}
                  {webcamActive ? 'Stop Stream' : 'Start Stream'}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button className="p-1.5 rounded hover:bg-slate-800 text-slate-300"><Play className="h-3.5 w-3.5" /></button>
                  <button className="p-1.5 rounded hover:bg-slate-800 text-slate-300"><Pause className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </div>

            <div className="text-[10px] font-mono font-bold text-slate-500">
              {camInfo.isWebcam && webcamActive ? `FPS: ${cameraFps}` : 'FPS: 30'}
            </div>
          </div>

        </div>

        {/* Camera Information */}
        <div className="xl:col-span-1 bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col justify-between shadow-md">
          <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted flex items-center gap-2 pb-3 border-b border-theme-border">
            <Cpu className="h-4 w-4 text-emerald-400" />
            Camera Information
          </h4>

          <div className="flex flex-col gap-4 py-4 text-xs font-semibold">
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">Camera Name</span>
              <span className="text-theme-text font-extrabold">{camInfo.name.split(' - ')[0]}</span>
            </div>
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">IP Address</span>
              <span className="text-theme-text font-mono">{camInfo.ip}</span>
            </div>
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">Status</span>
              <span className={cameraId === 'zone_cb' && !webcamActive ? 'text-red-400 font-extrabold uppercase' : 'text-emerald-400 font-extrabold uppercase'}>
                {cameraId === 'zone_cb' && !webcamActive ? 'Offline' : 'Online'}
              </span>
            </div>
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">Resolution</span>
              <span className="text-theme-text font-mono">1920 x 1080</span>
            </div>
            <div className="flex justify-between border-b border-theme-border pb-2">
              <span className="text-theme-text-muted">FPS</span>
              <span className="text-theme-text font-mono">{camInfo.isWebcam && webcamActive ? cameraFps : 30}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Uptime</span>
              <span className="text-theme-text font-mono">13d 4h 32m</span>
            </div>
          </div>
          
          <div className="w-full" />
        </div>

        {/* Recent Alerts */}
        <div className="xl:col-span-1 bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col justify-between shadow-md">
          <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted flex items-center gap-2 pb-3 border-b border-theme-border">
            <AlertTriangle className="h-4 w-4 text-emerald-400 animate-pulse" />
            Recent Alerts
          </h4>

          <div className="flex-1 flex flex-col gap-4.5 py-4 text-xs">
            {cameraAlerts.map((alert, idx) => (
              <div key={idx} className="flex items-start justify-between border-b border-theme-border pb-3 last:border-b-0 last:pb-0">
                <div className="flex flex-col gap-0.5">
                  <span className="font-extrabold text-theme-text">{alert.type}</span>
                  <span className="text-[9px] font-mono text-theme-text-muted">{alert.time}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black font-mono border uppercase shrink-0 ${
                  alert.severity === 'Critical'
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {alert.severity}
                </span>
              </div>
            ))}
          </div>

          <div className="w-full" />
        </div>

      </div>

      {/* Bottom Row: Performance + Past 24 Hours line chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        
        {/* Performance stats */}
        <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md">
          <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Performance</h4>
          
          <div className="flex-1 grid grid-cols-5 gap-3 items-center mt-2">
            
            {/* FPS */}
            <div className="flex flex-col gap-1 p-3 bg-theme-bg-alt/60 border border-theme-border rounded-2xl text-center">
              <span className="text-[8px] font-bold text-theme-text-muted uppercase tracking-wider">FPS</span>
              <span className="text-base font-black text-theme-text leading-none mt-1">
                {camInfo.isWebcam && webcamActive ? cameraFps : 30}
              </span>
            </div>

            {/* Latency */}
            <div className="flex flex-col gap-1 p-3 bg-theme-bg-alt/60 border border-theme-border rounded-2xl text-center">
              <span className="text-[8px] font-bold text-theme-text-muted uppercase tracking-wider">Latency</span>
              <span className="text-base font-black text-emerald-400 leading-none mt-1">18 ms</span>
            </div>

            {/* Bitrate */}
            <div className="flex flex-col gap-1 p-3 bg-theme-bg-alt/60 border border-theme-border rounded-2xl text-center">
              <span className="text-[8px] font-bold text-theme-text-muted uppercase tracking-wider">Bitrate</span>
              <span className="text-base font-black text-theme-text leading-none mt-1">4.5 Mbps</span>
            </div>

            {/* Packet Loss */}
            <div className="flex flex-col gap-1 p-3 bg-theme-bg-alt/60 border border-theme-border rounded-2xl text-center">
              <span className="text-[8px] font-bold text-theme-text-muted uppercase tracking-wider">Packet Loss</span>
              <span className="text-base font-black text-theme-text leading-none mt-1">0%</span>
            </div>

            {/* Health */}
            <div className="flex flex-col gap-1 p-3 bg-theme-bg-alt/60 border border-theme-border rounded-2xl text-center">
              <span className="text-[8px] font-bold text-theme-text-muted uppercase tracking-wider">Health</span>
              <span className="text-base font-black text-emerald-400 leading-none mt-1">92%</span>
            </div>

          </div>
        </div>

        {/* Past 24 Hours Alerts Chart */}
        <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md">
          <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Past 24 Hours Alerts</h4>
          <div className="flex-1 w-full h-[100px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={past24HoursData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <XAxis dataKey="hour" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '9px', color: '#fff' }} />
                <Line type="monotone" dataKey="Alerts" stroke="#ef4444" strokeWidth={2} dot={{ r: 2, fill: '#ef4444' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

    </div>
  );
}
