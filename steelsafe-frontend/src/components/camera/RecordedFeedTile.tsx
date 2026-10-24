import React, { useState, useEffect } from 'react';
import { Flame, AlertTriangle, ShieldCheck, VideoOff, Users } from 'lucide-react';

export interface CameraInfo {
  id: string;
  label: string;
  zone: string;
  source_type: 'webcam' | 'video_file';
  is_live: boolean;
  feed_badge: string;
  status: 'Online' | 'Offline';
  status_color: string;
  frame_url: string;
  restricted_zone_polygon?: [number, number][] | null;
  workers?: any[];
  total_persons_detected?: number;
  persons_in_restricted_zone?: number;
  fps?: number;
  last_updated?: string | null;
  tile_badge?: string | null;
  smoke_detected?: boolean;
  fire_detected?: boolean;
}

interface RecordedFeedTileProps {
  camera: CameraInfo;
  onSelectCamera?: (id: string) => void;
  className?: string;
}

export const RecordedFeedTile: React.FC<RecordedFeedTileProps> = ({
  camera,
  onSelectCamera,
  className = '',
}) => {
  const [cacheBuster, setCacheBuster] = useState<number>(Date.now());
  const [imgError, setImgError] = useState(false);

  // Poll image every 2.5 seconds to refresh the recorded feed frame
  useEffect(() => {
    const interval = setInterval(() => {
      setCacheBuster(Date.now());
      setImgError(false);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  const isOnline = camera.status === 'Online';
  const isCAM03 = camera.id === 'CAM03';
  const hasFireOrSmoke = Boolean(camera.fire_detected || camera.smoke_detected);
  const workers = camera.workers || [];
  const inZoneWorkers = workers.filter((w: any) => w.in_restricted_zone);
  const violations = inZoneWorkers.filter((w: any) => !w.is_compliant);

  return (
    <div
      onClick={() => onSelectCamera?.(camera.id)}
      className={`relative flex flex-col rounded-3xl border border-slate-800 bg-[#0a0f1d] overflow-hidden shadow-lg group transition-all duration-200 hover:border-slate-700 ${onSelectCamera ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Video / Frame Viewport Area */}
      <div className="relative aspect-video w-full bg-[#050811] overflow-hidden flex items-center justify-center">
        {/* Subtle CRT Scanline overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.35)_95%),linear-gradient(90deg,rgba(18,24,38,0)_95%,rgba(0,0,0,0.35)_95%)] bg-[size:20px_20px] pointer-events-none opacity-25 z-10" />

        {/* Live Frame Image */}
        {!imgError ? (
          <img
            src={`/api/live/frame/${camera.id}?t=${cacheBuster}`}
            alt={camera.label}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-opacity duration-300"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#121c33] via-[#090e1a] to-[#070b14] flex flex-col items-center justify-center gap-2 p-4 text-center">
            <VideoOff className="h-6 w-6 text-slate-500" />
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              {camera.id} — Feed Unavailable
            </span>
            <span className="text-[8px] font-mono text-slate-600">
              Degraded to offline mode
            </span>
          </div>
        )}

        {/* Top Badges Strip */}
        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between pointer-events-none z-20">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-extrabold text-white px-2 py-0.5 bg-black/75 rounded-md backdrop-blur-md border border-white/10 shadow">
              {camera.label}
            </span>
            <span className="text-[8px] font-mono font-bold text-slate-300 px-1.5 py-0.5 bg-slate-900/80 rounded border border-slate-700/60 backdrop-blur-sm hidden sm:inline">
              {camera.zone}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded border backdrop-blur-md bg-blue-500/20 text-blue-400 border-blue-500/30">
              RECORDED FEED
            </span>

            <span className={`text-[7px] font-mono font-black px-1.5 py-0.5 rounded border backdrop-blur-md flex items-center gap-1 ${
              isOnline
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-red-500/20 text-red-400 border-red-500/40'
            }`}>
              <span className={`h-1 w-1 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {isOnline ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* CAM03 Fire / Smoke Alert Banner Overlay */}
        {isCAM03 && (
          <div className="absolute bottom-2.5 inset-x-2.5 z-20 pointer-events-none">
            {hasFireOrSmoke ? (
              <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-red-600/90 border border-red-400 text-white rounded-xl shadow-lg animate-pulse backdrop-blur-sm">
                <Flame className="h-4 w-4 text-amber-300 animate-bounce" />
                <span className="text-[10px] font-mono font-black uppercase tracking-wider">
                  ⚠️ SMOKE / FIRE DETECTED — EVACUATION ALERT
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1.5 px-2.5 py-1 bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 rounded-lg backdrop-blur-sm">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                <span className="text-[8px] font-mono font-bold uppercase tracking-wider">
                  ZONE NORMAL — NO HAZARDS DETECTED
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Strip: Worker status or Zone safety telemetry */}
      <div className="px-3 py-2 bg-[#0d1424] border-t border-slate-800/80 flex items-center justify-between text-[9px] font-mono">
        <div className="flex items-center gap-1.5 text-slate-300">
          {isCAM03 ? (
            <div className="flex items-center gap-1.5">
              <Flame className={`h-3 w-3 ${hasFireOrSmoke ? 'text-red-400' : 'text-slate-500'}`} />
              <span className="text-slate-400">Hazard Detection:</span>
              <strong className={hasFireOrSmoke ? 'text-red-400' : 'text-emerald-400'}>
                {hasFireOrSmoke ? 'Fire / Smoke Alert' : 'Clear'}
              </strong>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-slate-400" />
              <span className="text-slate-400">Workers:</span>
              <strong className="text-white">{camera.total_persons_detected ?? workers.length}</strong>
              {inZoneWorkers.length > 0 && (
                <span className="text-slate-500">({inZoneWorkers.length} in zone)</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isCAM03 ? (
            <span className="text-slate-500 text-[8px]">Gas Cleaning Plant Feeds</span>
          ) : violations.length > 0 ? (
            <span className="text-red-400 font-bold flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              {violations.length} Missing PPE
            </span>
          ) : inZoneWorkers.length > 0 ? (
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              Compliant
            </span>
          ) : (
            <span className="text-slate-500 text-[8px]">Zone monitored</span>
          )}
        </div>
      </div>
    </div>
  );
};
