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
  helmet: boolean;
  vest: boolean;
  shoes: boolean;
  gloves: boolean;
  mask: boolean;
  isVirtual?: boolean;
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
  setPpeCompliant: (val: boolean | ((prev: boolean) => boolean)) => void;
  // 5 PPE categories simulation modes
  simulatedHelmet: 'Worn' | 'Missing' | 'Auto';
  simulatedVest: 'Worn' | 'Missing' | 'Auto';
  simulatedShoes: 'Worn' | 'Missing' | 'Auto';
  simulatedGloves: 'Worn' | 'Missing' | 'Auto';
  simulatedMask: 'Worn' | 'Missing' | 'Auto';
  setSimulatedHelmet: (val: 'Worn' | 'Missing' | 'Auto') => void;
  setSimulatedVest: (val: 'Worn' | 'Missing' | 'Auto') => void;
  setSimulatedShoes: (val: 'Worn' | 'Missing' | 'Auto') => void;
  setSimulatedGloves: (val: 'Worn' | 'Missing' | 'Auto') => void;
  setSimulatedMask: (val: 'Worn' | 'Missing' | 'Auto') => void;
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

export const evaluatePpeHeuristics = (
  video: HTMLVideoElement,
  bbox: [number, number, number, number],
  modes: {
    helmet: 'Worn' | 'Missing' | 'Auto';
    vest: 'Worn' | 'Missing' | 'Auto';
    shoes: 'Worn' | 'Missing' | 'Auto';
    gloves: 'Worn' | 'Missing' | 'Auto';
    mask: 'Worn' | 'Missing' | 'Auto';
  }
) => {
  const results = {
    helmet: modes.helmet === 'Worn',
    vest: modes.vest === 'Worn',
    shoes: modes.shoes === 'Worn',
    gloves: modes.gloves === 'Worn',
    mask: modes.mask === 'Worn',
  };

  if (
    modes.helmet !== 'Auto' &&
    modes.vest !== 'Auto' &&
    modes.shoes !== 'Auto' &&
    modes.gloves !== 'Auto' &&
    modes.mask !== 'Auto'
  ) {
    return results;
  }

  try {
    const [x, y, w, h] = bbox;
    if (w <= 0 || h <= 0) return results;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return results;

    ctx.drawImage(video, Math.max(0, x), Math.max(0, y), w, h, 0, 0, 64, 128);
    const imgData = ctx.getImageData(0, 0, 64, 128);
    const data = imgData.data;

    const getRegionStats = (startYPct: number, endYPct: number, startXPct: number = 0, endXPct: number = 1) => {
      const startY = Math.floor(startYPct * 128);
      const endY = Math.floor(endYPct * 128);
      const startX = Math.floor(startXPct * 64);
      const endX = Math.floor(endXPct * 64);

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      let matchingPpePixels = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * 64 + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          rSum += r;
          gSum += g;
          bSum += b;
          count++;

          const rNorm = r / 255;
          const gNorm = g / 255;
          const bNorm = b / 255;
          const maxVal = Math.max(rNorm, gNorm, bNorm);
          const minVal = Math.min(rNorm, gNorm, bNorm);
          let hVal = 0;
          let sVal = 0;
          const lVal = (maxVal + minVal) / 2;

          if (maxVal !== minVal) {
            const d = maxVal - minVal;
            sVal = lVal > 0.5 ? d / (2 - maxVal - minVal) : d / (maxVal + minVal);
            switch (maxVal) {
              case rNorm: hVal = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
              case gNorm: hVal = (bNorm - rNorm) / d + 2; break;
              case bNorm: hVal = (rNorm - gNorm) / d + 4; break;
            }
            hVal /= 6;
          }
          const hueDegrees = hVal * 360;

          // Color detection ranges
          const isYellowOrange = (hueDegrees >= 20 && hueDegrees <= 60 && sVal > 0.4 && lVal > 0.3 && lVal < 0.85);
          const isWhite = (sVal < 0.15 && lVal > 0.7);
          const isBlue = (hueDegrees >= 185 && hueDegrees <= 240 && sVal > 0.3 && lVal > 0.25 && lVal < 0.8);
          const isRed = ((hueDegrees <= 20 || hueDegrees >= 340) && sVal > 0.4 && lVal > 0.25 && lVal < 0.85);

          if (isYellowOrange || isWhite || isBlue || isRed) {
            matchingPpePixels++;
          }
        }
      }
      return {
        avgR: rSum / (count || 1),
        avgG: gSum / (count || 1),
        avgB: bSum / (count || 1),
        ppePct: matchingPpePixels / (count || 1),
        count
      };
    };

    if (modes.helmet === 'Auto') {
      const stats = getRegionStats(0.0, 0.15, 0.2, 0.8);
      results.helmet = stats.ppePct > 0.15;
    }

    if (modes.mask === 'Auto') {
      const stats = getRegionStats(0.08, 0.20, 0.25, 0.75);
      // mask: check for dominant light blue surgical mask or white mask colors
      results.mask = stats.ppePct > 0.12;
    }

    if (modes.vest === 'Auto') {
      const stats = getRegionStats(0.15, 0.55, 0.15, 0.85);
      results.vest = stats.ppePct > 0.15;
    }

    if (modes.gloves === 'Auto') {
      const leftHand = getRegionStats(0.45, 0.75, 0.0, 0.3);
      const rightHand = getRegionStats(0.45, 0.75, 0.7, 1.0);
      results.gloves = leftHand.ppePct > 0.12 || rightHand.ppePct > 0.12;
    }

    if (modes.shoes === 'Auto') {
      const stats = getRegionStats(0.82, 1.0, 0.1, 0.9);
      const avgLightness = (stats.avgR + stats.avgG + stats.avgB) / 3;
      results.shoes = avgLightness < 90; // dark safety boot colors
    }

  } catch (err) {
    console.warn("Error running color heuristics:", err);
  }

  return results;
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
  const [simulatedHelmet, setSimulatedHelmet] = useState<'Worn' | 'Missing' | 'Auto'>('Worn');
  const [simulatedVest, setSimulatedVest] = useState<'Worn' | 'Missing' | 'Auto'>('Worn');
  const [simulatedShoes, setSimulatedShoes] = useState<'Worn' | 'Missing' | 'Auto'>('Worn');
  const [simulatedGloves, setSimulatedGloves] = useState<'Worn' | 'Missing' | 'Auto'>('Worn');
  const [simulatedMask, setSimulatedMask] = useState<'Worn' | 'Missing' | 'Auto'>('Worn');

  const simHelmetRef = useRef<'Worn' | 'Missing' | 'Auto'>('Worn');
  const simVestRef = useRef<'Worn' | 'Missing' | 'Auto'>('Worn');
  const simShoesRef = useRef<'Worn' | 'Missing' | 'Auto'>('Worn');
  const simGlovesRef = useRef<'Worn' | 'Missing' | 'Auto'>('Worn');
  const simMaskRef = useRef<'Worn' | 'Missing' | 'Auto'>('Worn');

  useEffect(() => { simHelmetRef.current = simulatedHelmet; }, [simulatedHelmet]);
  useEffect(() => { simVestRef.current = simulatedVest; }, [simulatedVest]);
  useEffect(() => { simShoesRef.current = simulatedShoes; }, [simulatedShoes]);
  useEffect(() => { simGlovesRef.current = simulatedGloves; }, [simulatedGloves]);
  useEffect(() => { simMaskRef.current = simulatedMask; }, [simulatedMask]);

  const ppeCompliant = simulatedHelmet === 'Worn' && simulatedVest === 'Worn' && simulatedShoes === 'Worn' && simulatedGloves === 'Worn' && simulatedMask === 'Worn';

  const setPpeCompliant = React.useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const target = typeof val === 'function' ? val(ppeCompliant) : val;
    const mode = target ? 'Worn' : 'Missing';
    setSimulatedHelmet(mode);
    setSimulatedVest(mode);
    setSimulatedShoes(mode);
    setSimulatedGloves(mode);
    setSimulatedMask(mode);
  }, [ppeCompliant]);

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

  // Keep refs in sync with latest simulated states and reset consecutive counts
  useEffect(() => {
    trackedPersonsRef.current.forEach(tr => {
      tr.consecutiveCount = 0;
    });
  }, [simulatedHelmet, simulatedVest, simulatedShoes, simulatedGloves, simulatedMask]);

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

  const triggerViolation = async (tr: TrackedPerson, confidence: number, missingItems: string[]) => {
    // Guard: never fire a second open violation for a person that already has one
    if (tr.openViolationId !== null) return;
    if (!activePlantId || !realCamZone) return;

    const backendItems = missingItems.map(item => {
      if (item === 'helmet') return 'hard_hat';
      if (item === 'vest') return 'safety_vest';
      if (item === 'shoes') return 'safety_shoes';
      return item;
    });

    try {
      const response = await fetch('/api/v1/risk/ppe/violation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: realCamZone,
          plant_id: activePlantId,
          ppe_items_missing: backendItems,
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
      const people = detections.filter((p: any) => 
        p.class === 'person' && 
        p.score >= minScore &&
        p.bbox[2] < video.videoWidth * 0.9 &&
        p.bbox[3] < video.videoHeight * 0.9
      );
      const hasPerson = people.length > 0;
      setPersonDetected(hasPerson || webcamActive);

      // Process compliance transition helper
      const processPersonCompliance = async (tr: TrackedPerson, currentScore: number) => {
        const modes = {
          helmet: simHelmetRef.current,
          vest: simVestRef.current,
          shoes: simShoesRef.current,
          gloves: simGlovesRef.current,
          mask: simMaskRef.current,
        };

        const rawPpe = evaluatePpeHeuristics(video, tr.bbox, modes);
        
        const configEnablePpe = config.enablePpe;
        const rawCompliant = configEnablePpe
          ? (rawPpe.helmet && rawPpe.vest && rawPpe.shoes && rawPpe.gloves && rawPpe.mask)
          : true;

        const delayFrames = Math.max(2, Math.round(config.alertDelay * 1.5));
        
        if (tr.compliant === rawCompliant) {
          tr.consecutiveCount = 0;
          tr.helmet = configEnablePpe ? rawPpe.helmet : true;
          tr.vest = configEnablePpe ? rawPpe.vest : true;
          tr.shoes = configEnablePpe ? rawPpe.shoes : true;
          tr.gloves = configEnablePpe ? rawPpe.gloves : true;
          tr.mask = configEnablePpe ? rawPpe.mask : true;
        } else {
          tr.consecutiveCount++;
          if (tr.consecutiveCount >= delayFrames) {
            const oldCompliant = tr.compliant;
            tr.compliant = rawCompliant;
            tr.consecutiveCount = 0;

            tr.helmet = configEnablePpe ? rawPpe.helmet : true;
            tr.vest = configEnablePpe ? rawPpe.vest : true;
            tr.shoes = configEnablePpe ? rawPpe.shoes : true;
            tr.gloves = configEnablePpe ? rawPpe.gloves : true;
            tr.mask = configEnablePpe ? rawPpe.mask : true;

            if (oldCompliant && !tr.compliant) {
              const missingItems: string[] = [];
              if (!tr.helmet) missingItems.push('helmet');
              if (!tr.vest) missingItems.push('vest');
              if (!tr.shoes) missingItems.push('shoes');
              if (!tr.gloves) missingItems.push('gloves');
              if (!tr.mask) missingItems.push('mask');
              
              await triggerViolation(tr, currentScore, missingItems);
            } else if (!oldCompliant && tr.compliant) {
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
          isVirtual: false,
        };
      });

      if (detected.length === 0 && webcamActive) {
        const vW = video.videoWidth || 640;
        const vH = video.videoHeight || 480;
        detected.push({
          bbox: [
            Math.floor(vW * 0.3),
            Math.floor(vH * 0.15),
            Math.floor(vW * 0.4),
            Math.floor(vH * 0.7)
          ] as [number, number, number, number],
          score: 0.95,
          centerX: vW / 2,
          centerY: vH / 2,
          isVirtual: true,
        });
      }

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
            helmet: true,
            vest: true,
            shoes: true,
            gloves: true,
            mask: true,
            isVirtual: !!det.isVirtual,
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
        const entityName = tr.isVirtual ? 'CCTV Operator' : `Worker #${tr.id}`;
        
        let label = `✓ ${entityName}: Compliant (${scorePct}%)`;
        if (!tr.compliant) {
          const missing: string[] = [];
          if (!tr.helmet) missing.push('Helmet');
          if (!tr.vest) missing.push('Safety Vest');
          if (!tr.shoes) missing.push('Safety Shoes (beta)');
          if (!tr.gloves) missing.push('Gloves (beta)');
          if (!tr.mask) missing.push('Mask (beta)');
          label = `✗ ${entityName}: Missing: ${missing.length > 0 ? missing.join(', ') : 'None'} (${scorePct}%)`;
        }

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

        const allMissingItems = new Set<string>();
        activeTracked.forEach(t => {
          if (!t.compliant) {
            if (!t.helmet) allMissingItems.add('hard_hat');
            if (!t.vest) allMissingItems.add('safety_vest');
            if (!t.shoes) allMissingItems.add('safety_shoes');
            if (!t.gloves) allMissingItems.add('gloves');
            if (!t.mask) allMissingItems.add('mask');
          }
        });

        fetch('/api/v1/risk/camera/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zone_id: realCamZone,
            person_detected: hasPerson,
            ppe_compliant: violations === 0,
            ppe_items_missing: Array.from(allMissingItems),
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
  // ppeCompliant intentionally NOT in deps
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
        simulatedHelmet,
        simulatedVest,
        simulatedShoes,
        simulatedGloves,
        simulatedMask,
        setSimulatedHelmet,
        setSimulatedVest,
        setSimulatedShoes,
        setSimulatedGloves,
        setSimulatedMask,
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
