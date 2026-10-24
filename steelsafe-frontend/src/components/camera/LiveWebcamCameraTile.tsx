import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Video, VideoOff, RefreshCw, AlertTriangle, ShieldCheck, Users } from 'lucide-react';
import { useCamera } from '../../context/CameraContext';

export interface WorkerRecord {
  person_index: number;
  bbox: [number, number, number, number];
  in_restricted_zone: boolean;
  zone_name?: string | null;
  ppe?: Record<string, 'worn' | 'missing' | 'uncertain'>;
  required_ppe?: string[];
  violations?: string[];
  needs_review?: string[];
  is_compliant: boolean;
}

export interface FrameAnalysisResult {
  camera_id: string;
  timestamp?: string;
  total_persons_detected: number;
  persons_in_restricted_zone: number;
  violations_count?: number;
  workers: WorkerRecord[];
  zone_compliance_pct?: number | null;
  inference_ms?: number | null;
  model_backend?: string | null;
  smoke_detected?: boolean;
  fire_detected?: boolean;
  tile_badge?: string | null;
}

interface LiveWebcamCameraTileProps {
  cameraId?: string;
  label?: string;
  zone?: string;
  onSelectCamera?: (id: string) => void;
  className?: string;
}

export const LiveWebcamCameraTile: React.FC<LiveWebcamCameraTileProps> = ({
  cameraId = 'CAM01',
  label = 'CAM 01 - Coke Oven Battery',
  zone = 'Coke Oven Battery',
  onSelectCamera,
  className = '',
}) => {
  const { webcamActive, stream, startCamera, stopCamera } = useCamera();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [latestResult, setLatestResult] = useState<FrameAnalysisResult | null>(null);
  const [fps, setFps] = useState(0);
  const [lastInferenceTime, setLastInferenceTime] = useState<number | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsCalcRef = useRef(performance.now());

  // Attach webcam stream to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      if (stream) {
        videoRef.current.play().catch(e => console.warn('LiveWebcam video play:', e));
      }
    }
  }, [stream]);

  // Capture frame & post to /api/v1/detection/analyze-frame every 2.5s
  const captureAndAnalyze = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !webcamActive || video.readyState < 2) return;

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
      offscreenCanvasRef.current.width = 640;
      offscreenCanvasRef.current.height = 480;
    }
    const offCtx = offscreenCanvasRef.current.getContext('2d');
    if (!offCtx) return;

    offCtx.drawImage(video, 0, 0, 640, 480);
    const dataUrl = offscreenCanvasRef.current.toDataURL('image/jpeg', 0.8);
    const b64 = dataUrl.split(',')[1];
    if (!b64) return;

    setAnalyzing(true);
    const t0 = performance.now();
    try {
      const resp = await fetch('/api/v1/detection/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_id: cameraId,
          frame_b64: b64,
          image_format: 'jpeg',
          settings: {
            ppe_detection_enabled: true,
            detection_confidence_threshold: 0.35,
          },
        }),
      });

      if (resp.ok) {
        const data: FrameAnalysisResult = await resp.json();
        setLatestResult(data);
        setLastInferenceTime(Math.round(performance.now() - t0));
      }
    } catch (err) {
      console.warn('[LiveWebcamCameraTile] Detection analyze-frame failed:', err);
    } finally {
      setAnalyzing(false);
    }
  }, [webcamActive, cameraId]);

  // Periodic capture interval (2.5s aligned with backend capture_interval_s)
  useEffect(() => {
    if (!webcamActive) {
      setLatestResult(null);
      return;
    }

    // Run first capture shortly after stream begins
    const initialTimer = setTimeout(captureAndAnalyze, 500);
    const interval = setInterval(captureAndAnalyze, 2500);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [webcamActive, captureAndAnalyze]);

  // Overlay rendering loop (draws restricted zone polygon + bounding boxes)
  useEffect(() => {
    let animId: number;
    let isRunning = true;

    const renderOverlay = () => {
      if (!isRunning) return;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.readyState >= 2) {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, w, h);

          // 1. Draw CAM01 Restricted Zone Polygon: Right half [(0.5,0.0),(1.0,0.0),(1.0,1.0),(0.5,1.0)]
          const polyX = 0.5 * w;
          ctx.save();
          ctx.beginPath();
          ctx.rect(polyX, 0, w - polyX, h);
          ctx.setLineDash([8, 6]);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // 15% red fill
          ctx.fill();

          // Zone label watermark
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
          ctx.fillText('RESTRICTED ZONE (HELMET + VEST REQUIRED)', polyX + 12, 24);
          ctx.restore();

          // 2. Draw worker bounding boxes from latest FrameAnalysisResult
          if (latestResult && latestResult.workers) {
            latestResult.workers.forEach((worker) => {
              const [x1, y1, x2, y2] = worker.bbox;
              const boxW = Math.max(10, x2 - x1);
              const boxH = Math.max(10, y2 - y1);

              let boxColor = '#94a3b8'; // grey = outside zone
              let labelText = `Worker #${worker.person_index + 1} [OUTSIDE]`;

              if (worker.in_restricted_zone) {
                if (worker.is_compliant) {
                  boxColor = '#22c55e'; // green = compliant
                  labelText = `Worker #${worker.person_index + 1} [COMPLIANT]`;
                } else if (worker.violations && worker.violations.length > 0) {
                  boxColor = '#ef4444'; // red = violation
                  labelText = `Worker #${worker.person_index + 1} [MISSING: ${worker.violations.join(', ').toUpperCase()}]`;
                } else if (worker.needs_review && worker.needs_review.length > 0) {
                  boxColor = '#f59e0b'; // amber = review
                  labelText = `Worker #${worker.person_index + 1} [REVIEW: ${worker.needs_review.join(', ').toUpperCase()}]`;
                }
              }

              ctx.save();
              ctx.strokeStyle = boxColor;
              ctx.lineWidth = 3;
              ctx.strokeRect(x1, y1, boxW, boxH);

              // Label background pill
              ctx.font = 'bold 11px sans-serif';
              const textWidth = ctx.measureText(labelText).width;
              const pillY = Math.max(18, y1 - 8);
              ctx.fillStyle = boxColor;
              ctx.fillRect(x1, pillY - 14, textWidth + 12, 18);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(labelText, x1 + 6, pillY);
              ctx.restore();
            });
          }
        }
      }

      // Calculate approximate FPS
      frameCountRef.current++;
      const now = performance.now();
      if (now - lastFpsCalcRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (now - lastFpsCalcRef.current)));
        frameCountRef.current = 0;
        lastFpsCalcRef.current = now;
      }

      animId = requestAnimationFrame(renderOverlay);
    };

    if (webcamActive) {
      animId = requestAnimationFrame(renderOverlay);
    }

    return () => {
      isRunning = false;
      cancelAnimationFrame(animId);
    };
  }, [webcamActive, latestResult]);

  const workers = latestResult?.workers || [];
  const inZoneWorkers = workers.filter(w => w.in_restricted_zone);
  const violationWorkers = inZoneWorkers.filter(w => !w.is_compliant);

  return (
    <div
      onClick={() => onSelectCamera?.(cameraId)}
      className={`relative flex flex-col rounded-3xl border border-slate-800 bg-[#0a0f1d] overflow-hidden shadow-xl group ${onSelectCamera ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Video Viewport Area */}
      <div className="relative aspect-video w-full bg-[#050811] overflow-hidden flex items-center justify-center">
        {/* Subtle CRT Scanline overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.35)_95%),linear-gradient(90deg,rgba(18,24,38,0)_95%,rgba(0,0,0,0.35)_95%)] bg-[size:20px_20px] pointer-events-none opacity-25 z-10" />

        {/* Video and Canvas Overlays */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${webcamActive ? 'block' : 'hidden'}`}
        />
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none z-10 ${webcamActive ? 'block' : 'hidden'}`}
        />

        {/* Standby / Inactive State Placeholder */}
        {!webcamActive && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#121c33] via-[#090e1a] to-[#070b14] flex flex-col items-center justify-center gap-3 p-6 z-20">
            <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/50 text-slate-400">
              <Video className="h-7 w-7 text-emerald-400" />
            </div>
            <div className="text-center">
              <span className="text-[11px] font-mono font-extrabold text-slate-300 uppercase tracking-widest block">
                Real Laptop Webcam
              </span>
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block mt-0.5">
                Standby — Inactive
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                startCamera();
              }}
              className="mt-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg hover:shadow-emerald-500/25 flex items-center gap-2 transition-all cursor-pointer pointer-events-auto"
            >
              <Video className="h-4 w-4" />
              Activate Camera
            </button>
          </div>
        )}

        {/* Top Badges Strip */}
        <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-20">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-extrabold text-white px-2.5 py-1 bg-black/75 rounded-lg backdrop-blur-md border border-white/10 shadow">
              {label}
            </span>
            <span className="text-[9px] font-mono font-bold text-slate-300 px-2 py-0.5 bg-slate-900/80 rounded border border-slate-700/60 backdrop-blur-sm hidden sm:inline">
              {zone}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {webcamActive ? (
              <span className="text-[8px] font-mono font-black px-2 py-0.5 rounded-md border backdrop-blur-md bg-red-500/20 text-red-400 border-red-500/40 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                LIVE WEBCAM
              </span>
            ) : (
              <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded-md border backdrop-blur-md bg-amber-500/20 text-amber-400 border-amber-500/40">
                STANDBY
              </span>
            )}

            {webcamActive && (
              <span className="text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-black/60 text-slate-300 border border-slate-700/50">
                {fps || 30} FPS
              </span>
            )}

            {webcamActive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  stopCamera();
                }}
                className="pointer-events-auto ml-1 p-1 bg-black/70 hover:bg-red-600/80 text-white rounded-md border border-slate-700 transition-colors"
                title="Stop Camera"
              >
                <VideoOff className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Analyzing Spinner Watermark */}
        {analyzing && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[8px] font-mono text-emerald-400 bg-black/70 px-2 py-0.5 rounded border border-emerald-500/30 backdrop-blur-sm z-20">
            <RefreshCw className="h-2.5 w-2.5 animate-spin" />
            <span>AI YOLO {lastInferenceTime ? `(${lastInferenceTime}ms)` : ''}</span>
          </div>
        )}
      </div>

      {/* Bottom Strip: Per-Person Chip Row */}
      <div className="p-3 bg-[#0d1424] border-t border-slate-800/80 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-mono font-bold text-slate-300 uppercase">
              Monitored Workers ({workers.length})
            </span>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-mono">
            {inZoneWorkers.length > 0 && (
              <span className="text-slate-400">
                In Zone: <strong className="text-white">{inZoneWorkers.length}</strong>
              </span>
            )}
            {violationWorkers.length > 0 ? (
              <span className="text-red-400 font-bold flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-red-400" />
                {violationWorkers.length} Violations
              </span>
            ) : inZoneWorkers.length > 0 ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                Compliant
              </span>
            ) : null}
          </div>
        </div>

        {/* Workers Chips */}
        {workers.length === 0 ? (
          <div className="text-[9px] font-mono text-slate-500 italic py-1">
            {webcamActive ? 'No workers detected in live frame' : 'Camera is inactive'}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {workers.map((worker) => {
              const ppe = worker.ppe || {};
              const isCompliant = worker.is_compliant;
              return (
                <div
                  key={worker.person_index}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-mono ${
                    !worker.in_restricted_zone
                      ? 'bg-slate-900/60 border-slate-800 text-slate-400'
                      : isCompliant
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-950/40 border-red-500/40 text-red-300'
                  }`}
                >
                  <span className="font-bold">Worker #{worker.person_index + 1}:</span>
                  <span className="text-[8px] opacity-75">
                    {worker.in_restricted_zone ? '[IN ZONE]' : '[OUTSIDE]'}
                  </span>
                  <span className={`px-1 py-0.2 rounded text-[8px] font-bold ${
                    ppe.helmet === 'worn' ? 'bg-emerald-500/20 text-emerald-400' : ppe.helmet === 'missing' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    helmet {ppe.helmet === 'worn' ? '✓' : ppe.helmet === 'missing' ? '✗' : '?'}
                  </span>
                  <span className={`px-1 py-0.2 rounded text-[8px] font-bold ${
                    ppe.vest === 'worn' ? 'bg-emerald-500/20 text-emerald-400' : ppe.vest === 'missing' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    vest {ppe.vest === 'worn' ? '✓' : ppe.vest === 'missing' ? '✗' : '?'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
