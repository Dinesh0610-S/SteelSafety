import { useEffect, useRef, useState } from 'react';
import { Camera, Video, VideoOff, ShieldAlert, ShieldCheck, RefreshCw } from 'lucide-react';

export interface PPEViolationEvent {
  id: number;
  plant_id: string;
  zone_id: string;
  zone_name: string;
  ppe_items_missing: string[];
  detection_method: string;
  confidence_pct: number;
  status: 'open' | 'acknowledged' | 'resolved';
  timestamp: string;
  risk_score_at_time?: number;
}

export interface WorkerTarget {
  id: number;
  compliant: boolean;
  score: number;
}

interface CCTVPanelProps {
  selectedZoneId: string | null;
  onLiveRiskUpdate: (assessment: any) => void;
  onPPEViolation?: (event: PPEViolationEvent) => void;
  activePlantId?: string;
}

export function CCTVPanel({ selectedZoneId, onLiveRiskUpdate, onPPEViolation, activePlantId }: CCTVPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [loadingModel, setLoadingModel] = useState<boolean>(false);
  
  // Detection state
  const [personDetected, setPersonDetected] = useState<boolean>(false);
  const [ppeCompliant, setPpeCompliant] = useState<boolean>(true);
  const [detecting, setDetecting] = useState<boolean>(false);
  
  // Summary counts
  const [totalWorkers, setTotalWorkers] = useState<number>(0);
  const [compliantWorkers, setCompliantWorkers] = useState<number>(0);
  const [violationWorkers, setViolationWorkers] = useState<number>(0);

  // Active list of workers visible in frame
  const [workerList, setWorkerList] = useState<WorkerTarget[]>([]);

  // Ref to track reported workers to prevent duplicate alerts
  const reportedWorkersRef = useRef<Set<number>>(new Set());

  // Stable compliance tracking for temporal smoothing (flicker prevention)
  const stableComplianceRef = useRef<Record<number, { compliant: boolean; consecutiveCount: number }>>({});

  // Error / permission status
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Load TensorFlow.js and Coco-SSD from CDN dynamically
  useEffect(() => {
    let isMounted = true;

    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
      });
    };

    const initModels = async () => {
      if (loadingModel || modelLoaded) return;
      setLoadingModel(true);
      try {
        if (!(window as any).tf) {
          await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
        }
        if (!(window as any).cocoSsd) {
          await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js");
        }
        if (isMounted) {
          setModelLoaded(true);
        }
      } catch (err) {
        console.error("Could not load TensorFlow.js CDN scripts:", err);
      } finally {
        if (isMounted) {
          setLoadingModel(false);
        }
      }
    };

    initModels();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle webcam stream start/stop
  const startCamera = async () => {
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false
      });

      // Log track validity and settings
      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) {
        const track = tracks[0];
        console.log(`[CCTV Webcam] Track label: ${track.label}, readyState: ${track.readyState}`);
        console.log(`[CCTV Webcam] Track settings:`, track.getSettings());
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => {
          console.warn("Failed to play video stream automatically:", err);
        });
        setStreamActive(true);
      }
    } catch (err: any) {
      console.warn("Camera permission denied or unavailable:", err);
      setPermissionError(
        err.name === 'NotAllowedError' 
          ? "Camera permission denied by browser. Please enable permissions." 
          : "Webcam not found or inaccessible on this device."
      );
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setStreamActive(false);
      setPersonDetected(false);
      setTotalWorkers(0);
      setCompliantWorkers(0);
      setViolationWorkers(0);
      setWorkerList([]);
      reportedWorkersRef.current.clear();
      stableComplianceRef.current = {};
      sendStateToBackend(false, true);
    }
  };

  // Run Coco-SSD model detection loop on video stream
  useEffect(() => {
    if (!streamActive || !modelLoaded || !videoRef.current) return;

    let animationFrameId: number;
    let isRunning = true;
    let net: any = null;

    const startDetection = async () => {
      const coco = (window as any).cocoSsd;
      if (!coco) return;
      
      try {
        setDetecting(true);
        net = await coco.load();
        
        const detectFrame = async () => {
          if (!isRunning || !videoRef.current || !canvasRef.current) return;
          
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          if (video.readyState === 4 && ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const predictions = await net.detect(video);
            const people = predictions.filter((p: any) => p.class === 'person');
            const hasPerson = people.length > 0;
            setPersonDetected(hasPerson);
            
            // Sort left-to-right for stable worker indices
            const sortedPeople = [...people].sort((a: any, b: any) => a.bbox[0] - b.bbox[0]);
            
            let currentViolations = 0;
            const currentWorkers: WorkerTarget[] = [];
            
            sortedPeople.forEach((p: any, idx: number) => {
              const [x, y, width, height] = p.bbox;
              
              // Raw mixed compliance logic
              let rawCompliant = true;
              if (!ppeCompliant) {
                if (sortedPeople.length === 1) {
                  rawCompliant = false;
                } else if (idx >= 1) {
                  rawCompliant = false;
                }
              }
              
              // Apply temporal smoothing (consecutive frame buffer of 8 frames ~ 1.2s at ~6 FPS)
              if (!stableComplianceRef.current[idx]) {
                stableComplianceRef.current[idx] = { compliant: rawCompliant, consecutiveCount: 0 };
              }
              
              const stable = stableComplianceRef.current[idx];
              if (stable.compliant === rawCompliant) {
                stable.consecutiveCount = 0;
              } else {
                stable.consecutiveCount++;
                if (stable.consecutiveCount >= 8) {
                  stable.compliant = rawCompliant;
                  stable.consecutiveCount = 0;
                }
              }
              
              const isWorkerCompliant = stable.compliant;
              
              if (!isWorkerCompliant) {
                currentViolations++;
              }
              
              const scorePct = (p.score * 100).toFixed(0);
              currentWorkers.push({
                id: idx + 1,
                compliant: isWorkerCompliant,
                score: p.score
              });
              
              // Draw bounding box
              ctx.strokeStyle = isWorkerCompliant ? '#22c55e' : '#ef4444'; 
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y, width, height);
              
              // Draw status label banner
              const labelText = isWorkerCompliant 
                ? `✓ Worker #${idx + 1}: Compliant (${scorePct}%)`
                : `✗ Worker #${idx + 1}: Missing: Hard Hat (${scorePct}%)`;
                
              ctx.font = 'bold 11px sans-serif';
              const textWidth = ctx.measureText(labelText).width;
              const textHeight = 15;
              const textX = x;
              const textY = y > 20 ? y - 20 : 10;
              
              // Draw background rectangle for readability
              ctx.fillStyle = isWorkerCompliant ? '#22c55e' : '#ef4444';
              ctx.fillRect(textX, textY, textWidth + 10, textHeight + 4);
              
              // Draw text
              ctx.fillStyle = '#ffffff';
              ctx.fillText(labelText, textX + 5, textY + textHeight - 2);

              // Report violation to backend if transition to non-compliant happens
              if (!isWorkerCompliant) {
                if (!reportedWorkersRef.current.has(idx)) {
                  reportedWorkersRef.current.add(idx);
                  triggerPPEViolationForWorker(idx);
                }
              }
            });

            // Update statistics states
            setWorkerList(currentWorkers);
            setTotalWorkers(sortedPeople.length);
            setViolationWorkers(currentViolations);
            setCompliantWorkers(sortedPeople.length - currentViolations);

            if (sortedPeople.length === 0) {
              reportedWorkersRef.current.clear();
              stableComplianceRef.current = {};
            }
          }
          animationFrameId = requestAnimationFrame(detectFrame);
        };
        
        detectFrame();
      } catch (err) {
        console.error("Detection loop error:", err);
      }
    };

    startDetection();

    return () => {
      isRunning = false;
      setDetecting(false);
      cancelAnimationFrame(animationFrameId);
    };
  }, [streamActive, modelLoaded, ppeCompliant]);

  // Periodically send CCTV state to backend
  const sendStateToBackend = async (detected: boolean, compliant: boolean) => {
    if (selectedZoneId !== 'zone_ca') return;

    try {
      const response = await fetch('/api/v1/risk/camera/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: 'zone_ca',
          person_detected: detected,
          ppe_compliant: compliant
        })
      });
      if (response.ok) {
        const assessment = await response.json();
        onLiveRiskUpdate(assessment);
      }
    } catch (err) {
      console.warn("Failed to post camera state to backend:", err);
    }
  };

  // Trigger a PPE violation event in the backend for a specific worker
  const triggerPPEViolationForWorker = async (workerIndex: number) => {
    if (!activePlantId || !selectedZoneId) return;
    try {
      const response = await fetch('/api/v1/risk/ppe/violation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: selectedZoneId,
          plant_id: activePlantId,
          ppe_items_missing: ['hard_hat'],
          confidence_pct: 95.0,
          detection_method: 'manual_override',
          risk_score_at_time: 85.0
        })
      });
      if (response.ok && onPPEViolation) {
        const event = await response.json();
        // Specify worker identifier in the event
        event.zone_name = `${event.zone_name} (Worker #${workerIndex + 1})`;
        onPPEViolation(event);
      }
    } catch (err) {
      console.warn(`Failed to trigger PPE violation for worker ${workerIndex}:`, err);
    }
  };

  // Keep backend state in sync with UI indicators
  useEffect(() => {
    if (!streamActive) return;
    const isCompliant = violationWorkers === 0;
    sendStateToBackend(personDetected, isCompliant);

    const timer = setInterval(() => {
      const liveCompliant = violationWorkers === 0;
      sendStateToBackend(personDetected, liveCompliant);
    }, 1000);

    return () => clearInterval(timer);
  }, [streamActive, personDetected, violationWorkers, selectedZoneId]);

  return (
    <div className="card-soft-base bg-theme-card border border-theme-border p-5 flex flex-col gap-4">
      {/* Panel Header */}
      <div className="flex justify-between items-center border-b border-theme-border-muted pb-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4.5 w-4.5 text-theme-accent" />
          <h3 className="text-xs uppercase font-bold text-theme-text tracking-wider">
            Charging Platform CCTV Camera
          </h3>
        </div>
        <span className="text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-theme-accent-light bg-theme-accent-bg text-theme-accent">
          {modelLoaded ? "AI Model Ready" : "Loading Model..."}
        </span>
      </div>

      {/* Main View Area */}
      <div className="relative aspect-video w-full bg-theme-bg-alt rounded-2xl overflow-hidden border border-theme-border flex items-center justify-center shadow-inner">
        {/* video and canvas elements are always in the DOM but conditionally hidden */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute top-0 left-0 w-full h-full object-cover scale-x-[-1] ${streamActive ? 'block' : 'hidden'}`}
        />
        <canvas
          ref={canvasRef}
          className={`absolute top-0 left-0 w-full h-full object-cover scale-x-[-1] ${streamActive ? 'block' : 'hidden'}`}
        />

        {/* CCTV stream inactive overlay */}
        {!streamActive && (
          <div className="flex flex-col items-center gap-3 text-theme-text-muted text-center p-4">
            <VideoOff className="h-10 w-10 text-theme-text-muted" />
            <div>
              <p className="text-xs font-bold text-theme-text">CCTV Stream Inactive</p>
              <p className="text-[10px] text-theme-text-secondary max-w-[220px] mt-1 leading-normal font-medium">
                Webcam acts as a live sensor feed for the Charging Platform.
              </p>
            </div>
            <button
              onClick={startCamera}
              className="mt-1 px-4 py-2 bg-theme-accent hover:bg-theme-accent-hover text-theme-text-inverse text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-md shadow-theme-accent/20 active:scale-98"
            >
              <Video className="h-3.5 w-3.5" />
              Turn Camera On
            </button>
          </div>
        )}

        {/* Live Indicator overlay */}
        {streamActive && (
          <div className="absolute top-3 left-3 bg-theme-card/85 border border-theme-risk-crit-border px-2 py-0.5 rounded-full flex items-center gap-1.5 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-theme-risk-crit animate-ping" />
            <span className="text-[9px] font-mono font-bold text-theme-risk-crit-text">LIVE FEED</span>
          </div>
        )}

        {/* Bounding box model loading state */}
        {streamActive && !detecting && (
          <div className="absolute inset-0 bg-theme-bg-alt/90 flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
            <RefreshCw className="h-6 w-6 text-theme-accent animate-spin" />
            <span className="text-[10px] font-semibold text-theme-text-secondary">Initializing Object Detection...</span>
          </div>
        )}
      </div>

      {permissionError && (
        <div className="bg-theme-risk-crit-bg border border-theme-risk-crit-border p-3 rounded-2xl text-theme-risk-crit-text text-xs leading-normal font-semibold">
          {permissionError}
        </div>
      )}

      {/* Control and Status Section */}
      {streamActive && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
          {/* Status Indicators & Live Target List */}
          <div className="bg-theme-bg-alt border border-theme-border p-3 rounded-2xl flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-theme-text-secondary font-medium">Worker Detection:</span>
              <span className={`font-mono font-bold text-[9px] px-2 py-0.5 rounded-full ${
                personDetected 
                  ? 'bg-theme-accent-bg text-theme-accent border border-theme-accent-light' 
                  : 'bg-theme-border-muted text-theme-text-muted border border-transparent'
              }`}>
                {personDetected ? `${totalWorkers} PRESENT` : "NO TARGETS"}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-theme-text-secondary font-medium">PPE Verification:</span>
              {personDetected ? (
                violationWorkers > 0 ? (
                  <span className="font-mono font-bold text-[9px] px-2 py-0.5 rounded-full bg-theme-risk-crit-bg text-theme-risk-crit-text border border-theme-risk-crit-border flex items-center gap-1 animate-pulse">
                    <ShieldAlert className="h-3 w-3" /> {violationWorkers} VIOLATIONS
                  </span>
                ) : (
                  <span className="font-mono font-bold text-[9px] px-2 py-0.5 rounded-full bg-theme-risk-low-bg text-theme-risk-low-text border border-theme-risk-low-border flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> ALL COMPLIANT
                  </span>
                )
              ) : (
                <span className="font-mono text-theme-text-muted text-[9px]">STANDBY</span>
              )}
            </div>

            {/* Summary Statistics Breakdown */}
            {personDetected && (
              <div className="border-t border-theme-border/60 pt-2 mt-1 grid grid-cols-3 gap-1 text-[9px] font-mono font-bold text-center">
                <div className="bg-theme-card border border-theme-border p-1 rounded-lg">
                  <div className="text-theme-text">{totalWorkers}</div>
                  <div className="text-theme-text-muted text-[8px] uppercase font-bold">Detected</div>
                </div>
                <div className="bg-theme-card border border-theme-border p-1 rounded-lg">
                  <div className="text-theme-risk-low-text">{compliantWorkers}</div>
                  <div className="text-theme-text-muted text-[8px] uppercase font-bold">Compliant</div>
                </div>
                <div className="bg-theme-card border border-theme-border p-1 rounded-lg">
                  <div className="text-theme-risk-crit-text">{violationWorkers}</div>
                  <div className="text-theme-text-muted text-[8px] uppercase font-bold">Violations</div>
                </div>
              </div>
            )}

            {/* Dynamic Active Targets List View */}
            {personDetected && workerList.length > 0 && (
              <div className="border-t border-theme-border/60 pt-2 mt-2 flex flex-col gap-1.5">
                <div className="text-[9px] uppercase font-bold text-theme-text-secondary tracking-wider">
                  Active Targets List
                </div>
                <div className="flex flex-col gap-1 max-h-[80px] overflow-y-auto">
                  {workerList.map((worker) => (
                    <div key={worker.id} className="flex items-center justify-between text-[10px] font-mono font-bold bg-theme-card border border-theme-border/60 px-2 py-1 rounded-lg">
                      <span className="text-theme-text">Worker #{worker.id}</span>
                      <span className={`flex items-center gap-1 ${
                        worker.compliant ? 'text-theme-risk-low-text' : 'text-theme-risk-crit-text'
                      }`}>
                        {worker.compliant ? '✓ Compliant' : '✗ Missing: Hard Hat'}
                        <span className="text-[8px] text-theme-text-muted">({(worker.score * 100).toFixed(0)}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Toggle Switches / Overrides */}
          <div className="bg-theme-bg-alt border border-theme-border p-3 rounded-2xl flex flex-col justify-center gap-2 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-theme-text">PPE Simulation</span>
                <span className="text-[9px] text-theme-text-secondary font-semibold leading-none mt-0.5">Toggle hard-hat compliance</span>
              </div>
              <button
                onClick={() => {
                  setPpeCompliant(prev => !prev);
                }}
                className={`w-11 h-6 rounded-full p-0.5 transition-all ${
                  ppeCompliant ? 'bg-theme-risk-low' : 'bg-theme-risk-crit'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  ppeCompliant ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            <button
              onClick={stopCamera}
              className="px-3 py-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/50 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 text-[10px] font-bold rounded-xl transition-all flex items-center gap-1.5 self-end mt-1 active:scale-98"
            >
              <VideoOff className="h-3.5 w-3.5" />
              Turn Camera Off
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
