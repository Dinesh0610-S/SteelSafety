import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { usePlant } from './PlantContext';

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

export interface LivePrediction {
  bbox: [number, number, number, number];
  score: number;
  isCompliant: boolean;
  label: string;
}

export interface TrackedPerson {
  id: number;
  bbox: [number, number, number, number];
  score: number;
  compliant: boolean;
  consecutiveCount: number;
  openViolationId: number | null;
  framesSinceLastSeen: number;
}

interface CameraContextType {
  webcamActive: boolean;
  stream: MediaStream | null;
  modelLoaded: boolean;
  detecting: boolean;
  cameraFps: number;
  personDetected: boolean;
  totalWorkersDetected: number;
  violationWorkersCount: number;
  ppeCompliant: boolean;
  predictions: LivePrediction[];
  realCamZone: string;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  setPpeCompliant: React.Dispatch<React.SetStateAction<boolean>>;
}

const CameraContext = createContext<CameraContextType | undefined>(undefined);

export const drawPredictions = (
  canvas: HTMLCanvasElement,
  predictions: LivePrediction[],
  video: HTMLVideoElement
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  predictions.forEach((p) => {
    const [x, y, w, h] = p.bbox;
    ctx.strokeStyle = p.isCompliant ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    ctx.font = 'bold 11px sans-serif';
    const textW = ctx.measureText(p.label).width;
    ctx.fillStyle = p.isCompliant ? '#22c55e' : '#ef4444';
    ctx.fillRect(x, y > 20 ? y - 20 : 10, textW + 10, 19);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(p.label, x + 5, y > 20 ? y - 6 : 24);
  });
};

interface CameraProviderProps {
  children: React.ReactNode;
  onPPEViolation?: (event: PPEViolationEvent) => void;
}

export const CameraProvider: React.FC<CameraProviderProps> = ({ children, onPPEViolation }) => {
  const { activePlantId } = usePlant();
  const [webcamActive, setWebcamActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [cameraFps, setCameraFps] = useState(30);

  const [personDetected, setPersonDetected] = useState(false);
  const [totalWorkersDetected, setTotalWorkersDetected] = useState(0);
  const [violationWorkersCount, setViolationWorkersCount] = useState(0);
  const [ppeCompliant, setPpeCompliant] = useState(true);
  const ppeCompliantRef = useRef(true); // stable ref so inference loop reads latest without restart
  const [predictions, setPredictions] = useState<LivePrediction[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackedPersonsRef = useRef<TrackedPerson[]>([]);
  const nextTrackerIdRef = useRef<number>(1);
  const onPPEViolationRef = useRef(onPPEViolation); // stable ref to callback

  const realCamZone = useMemo(() => {
    return activePlantId === 'plant_rolling_mill' ? 'zone_rhf' : 'zone_cob1';
  }, [activePlantId]);

  // Load TensorFlow COCO-SSD model once
  useEffect(() => {
    let isMounted = true;
    const initModel = async () => {
      if (loadingModel || modelLoaded) return;
      setLoadingModel(true);
      try {
        await tf.ready();
        const loadedModel = (window as any).mockCocoSsd
          ? await (window as any).mockCocoSsd.load()
          : await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        if (isMounted) {
          setModel(loadedModel);
          setModelLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load TensorFlow COCO-SSD model:", err);
      } finally {
        if (isMounted) {
          setLoadingModel(false);
        }
      }
    };
    initModel();
    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize hidden video element
  useEffect(() => {
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    videoRef.current = video;
    return () => {
      video.srcObject = null;
      videoRef.current = null;
    };
  }, []);

  // Sync stream to background video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      if (stream) {
        videoRef.current.play().catch((err) => {
          console.warn("Failed to play background video:", err);
        });
      }
    }
  }, [stream]);

  // Reset temporal compliance smoothing on zone/plant switch
  useEffect(() => {
    trackedPersonsRef.current = [];
    nextTrackerIdRef.current = 1;
    setPredictions([]);
    setPersonDetected(false);
    setTotalWorkersDetected(0);
    setViolationWorkersCount(0);
  }, [realCamZone]);

  // Keep refs in sync with latest state/prop values
  useEffect(() => {
    ppeCompliantRef.current = ppeCompliant;
    // Reset consecutive counts so the new state is evaluated fresh (no carry-over frames)
    trackedPersonsRef.current.forEach(tr => {
      tr.consecutiveCount = 0;
    });
  }, [ppeCompliant]);

  useEffect(() => {
    onPPEViolationRef.current = onPPEViolation;
  }, [onPPEViolation]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: { ideal: 30 } },
        audio: false,
      });
      setStream(mediaStream);
      setWebcamActive(true);
    } catch (err) {
      console.error("Error accessing webcam:", err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
    setWebcamActive(false);
    setDetecting(false);
    setPersonDetected(false);
    setTotalWorkersDetected(0);
    setViolationWorkersCount(0);
    setPredictions([]);
    trackedPersonsRef.current = [];
    nextTrackerIdRef.current = 1;

    // Send inactive camera state to backend
    fetch('/api/v1/risk/camera/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zone_id: realCamZone,
        person_detected: false,
        ppe_compliant: true,
      }),
    }).catch(() => {});
  };

  const triggerViolation = async (tr: TrackedPerson, confidence: number) => {
    // Guard: never fire a second open violation for a person that already has one
    if (tr.openViolationId !== null) return;
    if (!activePlantId || !realCamZone) return;
    try {
      const response = await fetch('/api/v1/risk/ppe/violation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: realCamZone,
          plant_id: activePlantId,
          ppe_items_missing: ['hard_hat'],
          confidence_pct: Math.round(confidence * 100),
          detection_method: 'model_inferred',
          risk_score_at_time: 85.0,
        }),
      });
      if (response.ok) {
        const event = await response.json();
        tr.openViolationId = event.id;
        event.zone_name = `${event.zone_name} (Worker #${tr.id})`;
        onPPEViolationRef.current?.(event);
      }
    } catch (err) {
      console.warn("Failed to trigger PPE violation:", err);
    }
  };

  const resolveViolation = async (tr: TrackedPerson) => {
    if (!tr.openViolationId) return;
    const violationId = tr.openViolationId;
    // Optimistically clear so no second resolve call races in
    tr.openViolationId = null;
    try {
      const response = await fetch(`/api/v1/risk/ppe/violations/${violationId}/resolve`, {
        method: 'POST',
      });
      if (response.ok) {
        const event = await response.json();
        event.zone_name = `${event.zone_name} (Worker #${tr.id})`;
        onPPEViolationRef.current?.(event);
      }
    } catch (err) {
      console.warn("Failed to resolve PPE violation:", err);
    }
  };

  // Inference loop
  useEffect(() => {
    if (!webcamActive || !modelLoaded || !model || !stream) return;

    let animationFrameId: number;
    let isRunning = true;
    let lastFrameTime = performance.now();
    let lastCctvHeartbeat = 0;

    const detectFrame = async () => {
      const video = videoRef.current;
      if (!isRunning || !video || video.readyState !== 4) {
        if (isRunning) {
          animationFrameId = requestAnimationFrame(detectFrame);
        }
        return;
      }

      // FPS calculation
      const now = performance.now();
      const fps = Math.round(1000 / (now - lastFrameTime));
      lastFrameTime = now;
      setCameraFps(Math.min(30, fps));

      setDetecting(true);

      const savedSettings = localStorage.getItem('steelsafe_settings');
      let config = { confidenceThreshold: 70, alertDelay: 5, enablePpe: true };
      if (savedSettings) {
        try {
          config = { ...config, ...JSON.parse(savedSettings) };
        } catch (_) {}
      }

      const minScore = config.confidenceThreshold / 100.0;
      const detections = await model.detect(video);
      const people = detections.filter((p: any) => p.class === 'person' && p.score >= minScore);
      const hasPerson = people.length > 0;
      setPersonDetected(hasPerson);

      // Process compliance transition helper
      const processPersonCompliance = async (tr: TrackedPerson, currentScore: number) => {
        // Read from ref so we always have the latest value without restarting the loop
        const rawCompliant = config.enablePpe ? ppeCompliantRef.current : true;
        const delayFrames = Math.max(2, Math.round(config.alertDelay * 1.5));
        
        if (tr.compliant === rawCompliant) {
          tr.consecutiveCount = 0;
        } else {
          tr.consecutiveCount++;
          if (tr.consecutiveCount >= delayFrames) {
            const oldCompliant = tr.compliant;
            tr.compliant = rawCompliant;
            tr.consecutiveCount = 0;

            if (oldCompliant && !tr.compliant) {
              // Compliant -> Non-compliant
              await triggerViolation(tr, currentScore);
            } else if (!oldCompliant && tr.compliant) {
              // Non-compliant -> Compliant
              await resolveViolation(tr);
            }
          }
        }
      };

      // Multi-person proximity tracking
      const currentTracked = trackedPersonsRef.current;
      const detected = people.map((p: any) => {
        const [x, y, w, h] = p.bbox;
        return {
          bbox: p.bbox as [number, number, number, number],
          score: p.score,
          centerX: x + w / 2,
          centerY: y + h / 2,
        };
      });

      // Compute pairwise distances between detected and tracked
      const DISTANCE_THRESHOLD = 150;
      const matches: Array<{ detIdx: number; trIdx: number; dist: number }> = [];

      detected.forEach((det: any, detIdx: number) => {
        currentTracked.forEach((tr, trIdx) => {
          const [tx, ty, tw, th] = tr.bbox;
          const tCenterX = tx + tw / 2;
          const tCenterY = ty + th / 2;
          const dist = Math.hypot(det.centerX - tCenterX, det.centerY - tCenterY);
          if (dist < DISTANCE_THRESHOLD) {
            matches.push({ detIdx, trIdx, dist });
          }
        });
      });

      // Greedy match
      matches.sort((a, b) => a.dist - b.dist);
      const matchedDets = new Set<number>();
      const matchedTrs = new Set<number>();

      matches.forEach(m => {
        if (!matchedDets.has(m.detIdx) && !matchedTrs.has(m.trIdx)) {
          matchedDets.add(m.detIdx);
          matchedTrs.add(m.trIdx);

          const det = detected[m.detIdx];
          const tr = currentTracked[m.trIdx];
          tr.bbox = det.bbox;
          tr.score = det.score;
          tr.framesSinceLastSeen = 0;
        }
      });

      // Increment framesSinceLastSeen for unmatched tracked persons
      currentTracked.forEach((tr, trIdx) => {
        if (!matchedTrs.has(trIdx)) {
          tr.framesSinceLastSeen++;
        }
      });

      // Filter out stale tracked persons
      trackedPersonsRef.current = currentTracked.filter(tr => tr.framesSinceLastSeen <= 30);

      // Create new tracked persons for unmatched detections
      detected.forEach((det: any, detIdx: number) => {
        if (!matchedDets.has(detIdx)) {
          const newId = nextTrackerIdRef.current++;
          const tr: TrackedPerson = {
            id: newId,
            bbox: det.bbox,
            score: det.score,
            compliant: true, // assume compliant initially to let smoothing verify status
            consecutiveCount: 0,
            openViolationId: null,
            framesSinceLastSeen: 0,
          };
          trackedPersonsRef.current.push(tr);
        }
      });

      // Run compliance check for all currently visible tracked persons
      let violations = 0;
      const activeTracked = trackedPersonsRef.current.filter(tr => tr.framesSinceLastSeen === 0);

      for (const tr of activeTracked) {
        await processPersonCompliance(tr, tr.score);
        if (!tr.compliant) {
          violations++;
        }
      }

      const livePredictions: LivePrediction[] = activeTracked.map((tr) => {
        const scorePct = (tr.score * 100).toFixed(0);
        const label = tr.compliant
          ? `✓ Worker #${tr.id}: Compliant (${scorePct}%)`
          : `✗ Worker #${tr.id}: Missing: Hard Hat (${scorePct}%)`;

        return {
          bbox: tr.bbox,
          score: tr.score,
          isCompliant: tr.compliant,
          label,
        };
      });

      setTotalWorkersDetected(activeTracked.length);
      setViolationWorkersCount(violations);
      setPredictions(livePredictions);

      // CCTV state heartbeat updates risk engine
      const nowMs = Date.now();
      if (nowMs - lastCctvHeartbeat > 2000) {
        lastCctvHeartbeat = nowMs;
        fetch('/api/v1/risk/camera/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zone_id: realCamZone,
            person_detected: hasPerson,
            ppe_compliant: violations === 0,
          }),
        }).catch(() => {});
      }

      if (isRunning) {
        animationFrameId = requestAnimationFrame(detectFrame);
      }
    };

    detectFrame();

    return () => {
      isRunning = false;
      setDetecting(false);
      cancelAnimationFrame(animationFrameId);
    };
  // ppeCompliant intentionally NOT in deps — we read it via ppeCompliantRef.current
  // to avoid restarting the loop (and losing tracking state) on every toggle
  }, [webcamActive, modelLoaded, model, stream, realCamZone]);

  return (
    <CameraContext.Provider
      value={{
        webcamActive,
        stream,
        modelLoaded,
        detecting,
        cameraFps,
        personDetected,
        totalWorkersDetected,
        violationWorkersCount,
        ppeCompliant,
        predictions,
        realCamZone,
        startCamera,
        stopCamera,
        setPpeCompliant,
      }}
    >
      {children}
    </CameraContext.Provider>
  );
};

export const useCamera = () => {
  const context = useContext(CameraContext);
  if (!context) {
    throw new Error('useCamera must be used within a CameraProvider');
  }
  return context;
};
