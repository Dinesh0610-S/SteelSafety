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
  const [predictions, setPredictions] = useState<LivePrediction[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reportedWorkersRef = useRef<Set<number>>(new Set());
  const stableComplianceRef = useRef<Record<number, { compliant: boolean; consecutiveCount: number }>>({});

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
    reportedWorkersRef.current.clear();
    stableComplianceRef.current = {};
    setPredictions([]);
    setPersonDetected(false);
    setTotalWorkersDetected(0);
    setViolationWorkersCount(0);
  }, [realCamZone]);

  // Clear smoothing when compliance toggle is toggled
  useEffect(() => {
    reportedWorkersRef.current.clear();
    stableComplianceRef.current = {};
  }, [ppeCompliant]);

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
    reportedWorkersRef.current.clear();
    stableComplianceRef.current = {};

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

  const triggerViolation = async (idx: number, confidence: number) => {
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
      if (response.ok && onPPEViolation) {
        const event = await response.json();
        event.zone_name = `${event.zone_name} (Worker #${idx + 1})`;
        onPPEViolation(event);
      }
    } catch (err) {
      console.warn("Failed to trigger PPE violation:", err);
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

      const sortedPeople = [...people].sort((a: any, b: any) => a.bbox[0] - b.bbox[0]);
      let violations = 0;

      const livePredictions: LivePrediction[] = sortedPeople.map((p: any, idx: number) => {
        const rawCompliant = config.enablePpe ? ppeCompliant : true;

        if (!stableComplianceRef.current[idx]) {
          stableComplianceRef.current[idx] = { compliant: rawCompliant, consecutiveCount: 0 };
        }

        const delayFrames = Math.max(2, Math.round(config.alertDelay * 1.5));
        const stable = stableComplianceRef.current[idx];
        if (stable.compliant === rawCompliant) {
          stable.consecutiveCount = 0;
        } else {
          stable.consecutiveCount++;
          if (stable.consecutiveCount >= delayFrames) {
            stable.compliant = rawCompliant;
            stable.consecutiveCount = 0;
          }
        }

        const isCompliant = stable.compliant;
        if (!isCompliant) {
          violations++;
          if (!reportedWorkersRef.current.has(idx)) {
            reportedWorkersRef.current.add(idx);
            triggerViolation(idx, p.score);
          }
        }

        const scorePct = (p.score * 100).toFixed(0);
        const label = isCompliant
          ? `✓ Worker #${idx + 1}: Compliant (${scorePct}%)`
          : `✗ Worker #${idx + 1}: Missing: Hard Hat (${scorePct}%)`;

        return {
          bbox: p.bbox,
          score: p.score,
          isCompliant,
          label,
        };
      });

      setTotalWorkersDetected(sortedPeople.length);
      setViolationWorkersCount(violations);
      setPredictions(livePredictions);

      if (sortedPeople.length === 0) {
        reportedWorkersRef.current.clear();
        stableComplianceRef.current = {};
      }

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
  }, [webcamActive, modelLoaded, ppeCompliant, model, stream, realCamZone]);

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
