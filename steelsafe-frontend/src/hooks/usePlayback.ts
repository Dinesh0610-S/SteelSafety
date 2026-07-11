import { useState, useEffect, useRef } from 'react';

export interface PlaybackState {
  virtualTime: Date | null;
  isPlaying: boolean;
  speed: number;
  t0: Date | null;
  t8: Date | null;
}

export function usePlayback(t0SimulatedStr: string | null, onReset: () => void) {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(60); // default 60x compression (1 sec real = 1 min sim)
  const [virtualTime, setVirtualTime] = useState<Date | null>(null);

  const t0Ref = useRef<Date | null>(null);
  const t8Ref = useRef<Date | null>(null);
  const timerRef = useRef<any>(null);

  // Initialize bounds when t0 string changes
  useEffect(() => {
    if (t0SimulatedStr) {
      const start = new Date(t0SimulatedStr);
      const end = new Date(start.getTime() + 8 * 3600 * 1000); // 8-hour shift
      t0Ref.current = start;
      t8Ref.current = end;
      setVirtualTime(start);
    }
  }, [t0SimulatedStr]);

  // Virtual time ticker
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (!isPlaying || !virtualTime || !t0Ref.current || !t8Ref.current) return;

    const tickIntervalMs = 1000; // tick every 1 second

    timerRef.current = setInterval(() => {
      setVirtualTime((prev) => {
        if (!prev || !t8Ref.current) return prev;
        const nextTime = new Date(prev.getTime() + speed * 1000); // add 'speed' simulated seconds
        if (nextTime >= t8Ref.current) {
          setIsPlaying(false);
          return t8Ref.current;
        }
        return nextTime;
      });
    }, tickIntervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, virtualTime]);

  const togglePlay = () => setIsPlaying((p) => !p);

  const seekTo = (fraction: number) => {
    if (!t0Ref.current || !t8Ref.current) return;
    const range = t8Ref.current.getTime() - t0Ref.current.getTime();
    const targetMs = t0Ref.current.getTime() + fraction * range;
    setVirtualTime(new Date(targetMs));
  };

  const resetTime = () => {
    if (t0Ref.current) {
      setVirtualTime(t0Ref.current);
      setIsPlaying(true);
    }
    onReset();
  };

  const getProgressFraction = (): number => {
    if (!virtualTime || !t0Ref.current || !t8Ref.current) return 0;
    const numerator = virtualTime.getTime() - t0Ref.current.getTime();
    const denominator = t8Ref.current.getTime() - t0Ref.current.getTime();
    return Math.max(0, Math.min(1, numerator / denominator));
  };

  return {
    virtualTime,
    isPlaying,
    speed,
    t0: t0Ref.current,
    t8: t8Ref.current,
    setIsPlaying,
    setSpeed,
    togglePlay,
    seekTo,
    resetTime,
    progressFraction: getProgressFraction(),
  };
}
