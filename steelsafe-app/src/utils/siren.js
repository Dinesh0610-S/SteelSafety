/**
 * Industrial Safety Audio Alert Engine
 * Generates an authentic industrial two-tone siren using Web Audio API (zero external assets needed)
 * Includes continuous emergency loop and Web Speech synthesis for audible voice evacuations.
 */

class SirenAudioEngine {
  constructor() {
    this.ctx = null;
    this.osc1 = null;
    this.osc2 = null;
    this.gain = null;
    this.isPlaying = false;
    this.isEmergencyPlaying = false;
    this.emergencyInterval = null;
    this.isMuted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  playSiren(durationMs = 2800) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';

      // Industrial warble frequency ramp: 560Hz -> 940Hz -> 560Hz
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.linearRampToValueAtTime(940, now + 0.35);
      osc.frequency.linearRampToValueAtTime(560, now + 0.70);
      osc.frequency.linearRampToValueAtTime(940, now + 1.05);
      osc.frequency.linearRampToValueAtTime(560, now + 1.40);
      osc.frequency.linearRampToValueAtTime(940, now + 1.75);
      osc.frequency.linearRampToValueAtTime(560, now + 2.10);

      // Volume envelope
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.1);
      gain.gain.setValueAtTime(0.28, now + durationMs / 1000 - 0.2);
      gain.gain.linearRampToValueAtTime(0.001, now + durationMs / 1000);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + durationMs / 1000);
    } catch (e) {
      console.warn('Audio siren play warning:', e);
    }
  }

  startEmergencySiren() {
    if (this.isEmergencyPlaying) return;
    this.isEmergencyPlaying = true;
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const loop = () => {
      if (!this.isEmergencyPlaying) return;
      if (!this.isMuted) {
        this.playSiren(2400);
      }
      this.emergencyInterval = setTimeout(loop, 2500);
    };

    loop();
  }

  stopEmergencySiren() {
    this.isEmergencyPlaying = false;
    if (this.emergencyInterval) {
      clearTimeout(this.emergencyInterval);
      this.emergencyInterval = null;
    }
    this.stopSpeech();
  }

  speakWarning(text = 'Emergency alert. Critical hazard detected in plant. Evacuate zone immediately. Follow emergency protocols and report to designated assembly points.') {
    if (this.isMuted) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.05;
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const chosenVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('David') || v.name.includes('Zira')));
      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis warning:', e);
    }
  }

  stopSpeech() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopSpeech();
    }
    return this.isMuted;
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (this.isMuted) {
      this.stopSpeech();
    }
  }
}

export const sirenEngine = new SirenAudioEngine();
