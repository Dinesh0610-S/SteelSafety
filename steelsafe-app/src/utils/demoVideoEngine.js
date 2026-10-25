/**
 * SteelSafe Synthetic Demo Video & Telemetry Engine
 * Renders authentic animated steel plant video scenes to HTML5 Canvas
 * and generates realistic simulated computer-vision safety incidents
 * for camera-free demonstrations.
 */

export const DEMO_SCENES = [
  {
    id: 'furnace',
    name: 'Blast Furnace Molten Bay #01',
    zone: 'Zone A - Blast Furnace',
    description: 'High-temperature smelting, molten metal runner, and crucible area',
  },
  {
    id: 'rolling',
    name: 'Rolling Mill Hot Line #02',
    zone: 'Zone B - Rolling Mill',
    description: 'Billet reduction, high-speed rollers, and heavy gantry runway',
  },
  {
    id: 'casting',
    name: 'Continuous Casting Turret #03',
    zone: 'Zone C - Continuous Casting',
    description: 'Tundish casting, slag skimming, and restricted crane path',
  },
];

class DemoVideoEngine {
  constructor() {
    this.particles = [];
    this._initParticles();
  }

  _initParticles() {
    this.particles = [];
    for (let i = 0; i < 45; i++) {
      this.particles.push({
        x: Math.random(),
        y: Math.random(),
        size: 1 + Math.random() * 3.5,
        speedY: 0.002 + Math.random() * 0.005,
        speedX: (Math.random() - 0.5) * 0.002,
        alpha: 0.2 + Math.random() * 0.8,
        color: Math.random() > 0.4 ? '#f97316' : '#eab308', // Ember orange & sparks
      });
    }
  }

  /**
   * Renders an animated steel manufacturing scene onto a canvas
   */
  renderScene(ctx, width, height, sceneId = 'furnace', frame = 0) {
    const t = frame * 0.03;

    // 1. Dark Industrial Foundry Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0a0b10');
    bgGrad.addColorStop(0.5, '#12141d');
    bgGrad.addColorStop(1, '#1b1d28');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Structural Steel Columns & I-Beams
    ctx.save();
    ctx.fillStyle = '#1e2230';
    // Left column
    ctx.fillRect(width * 0.06, 0, width * 0.04, height);
    // Right column
    ctx.fillRect(width * 0.90, 0, width * 0.04, height);
    // Overhead Crane Rail Gantry
    ctx.fillStyle = '#262a3d';
    ctx.fillRect(0, height * 0.18, width, height * 0.06);

    // Overhead Travelling Crane Hook moving horizontally
    const craneX = width * (0.3 + 0.4 * Math.sin(t * 0.4));
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(craneX, height * 0.17, width * 0.08, height * 0.08);
    // Cable and hook
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(craneX + width * 0.04, height * 0.25);
    ctx.lineTo(craneX + width * 0.04, height * 0.45);
    ctx.stroke();
    // Heavy Ladle
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.roundRect(craneX + width * 0.015, height * 0.45, width * 0.05, height * 0.10, [4, 4, 8, 8]);
    ctx.fill();
    ctx.restore();

    // 3. Molten Metal Runner / Glow Floor Channel
    ctx.save();
    const glowY = height * 0.72;
    const runnerGrad = ctx.createLinearGradient(0, glowY, width, height);
    runnerGrad.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
    runnerGrad.addColorStop(0.3, 'rgba(249, 115, 22, 0.85)');
    runnerGrad.addColorStop(0.5, 'rgba(253, 224, 71, 0.95)');
    runnerGrad.addColorStop(0.7, 'rgba(249, 115, 22, 0.85)');
    runnerGrad.addColorStop(1, 'rgba(239, 68, 68, 0.15)');

    ctx.fillStyle = runnerGrad;
    ctx.beginPath();
    ctx.moveTo(width * 0.2, height);
    ctx.lineTo(width * 0.4, glowY);
    ctx.lineTo(width * 0.65, glowY);
    ctx.lineTo(width * 0.85, height);
    ctx.closePath();
    ctx.fill();

    // Molten heat shimmer aura
    const pulse = 0.85 + 0.15 * Math.sin(t * 3);
    ctx.shadowColor = '#ea580c';
    ctx.shadowBlur = 25 * pulse;
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 4. Moving Ember Sparks
    ctx.save();
    for (const p of this.particles) {
      p.y -= p.speedY;
      p.x += p.speedX;
      if (p.y < 0.2) {
        p.y = 0.8 + Math.random() * 0.2;
        p.x = 0.35 + Math.random() * 0.3;
      }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha * (0.6 + 0.4 * Math.sin(t * 5 + p.size));
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 5. Animated Simulated Worker Silhouettes
    ctx.save();
    // Worker 1: Moving near gantry
    const w1X = width * (0.28 + 0.08 * Math.sin(t * 0.6));
    const w1Y = height * 0.52;
    this._drawWorkerFigure(ctx, w1X, w1Y, width * 0.035, height * 0.18, true, true); // Has helmet & vest

    // Worker 2: Approaching restricted zone
    const w2X = width * (0.62 + 0.12 * Math.cos(t * 0.45));
    const w2Y = height * 0.54;
    this._drawWorkerFigure(ctx, w2X, w2Y, width * 0.035, height * 0.18, false, true); // Missing helmet
    ctx.restore();

    // 6. Prominent Demo Mode HUD & Watermark
    this._drawDemoWatermark(ctx, width, height, sceneId, frame);
  }

  _drawWorkerFigure(ctx, x, y, w, h, hasHelmet = true, hasVest = true) {
    ctx.save();
    // Legs
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + w * 0.2, y + h * 0.55, w * 0.25, h * 0.45);
    ctx.fillRect(x + w * 0.55, y + h * 0.55, w * 0.25, h * 0.45);

    // Torso / Vest
    ctx.fillStyle = hasVest ? '#f97316' : '#334155'; // Orange safety vest vs dark grey shirt
    ctx.fillRect(x + w * 0.15, y + h * 0.25, w * 0.7, h * 0.35);

    if (hasVest) {
      // Reflective silver bands on vest
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.04);
      ctx.fillRect(x + w * 0.15, y + h * 0.45, w * 0.7, h * 0.04);
    }

    // Head
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.15, w * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Hard Hat / Helmet
    if (hasHelmet) {
      ctx.fillStyle = '#eab308'; // Safety Yellow hard hat
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + h * 0.09, w * 0.32, h * 0.08, 0, Math.PI, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawDemoWatermark(ctx, width, height, sceneId, frame) {
    ctx.save();
    // Top-Left Watermark Pill
    const tagX = 14;
    const tagY = 14;
    ctx.fillStyle = 'rgba(234, 179, 8, 0.92)'; // Industrial Amber
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, 230, 24, 4);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = '800 11px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('DEMO MODE · SIMULATED DATA', tagX + 10, tagY + 16);

    // Sub-label
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(tagX, tagY + 28, 230, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 10px monospace';
    const sceneObj = DEMO_SCENES.find(s => s.id === sceneId) || DEMO_SCENES[0];
    ctx.fillText(`SCENE: ${sceneObj.name.toUpperCase()}`, tagX + 8, tagY + 42);

    // Bottom-Right Tech HUD Overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(width - 240, height - 32, 226, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 10px monospace';
    ctx.fillText('SYNTHETIC AI VISION FEED [OFFLINE]', width - 232, height - 17);

    ctx.restore();
  }

  /**
   * Generates realistic simulated computer vision detections for the current scene
   */
  getSimulatedDetections(width, height, sceneId = 'furnace', frame = 0) {
    const t = frame * 0.03;
    const detections = [];

    // Worker 1: Compliant
    const w1X = width * (0.28 + 0.08 * Math.sin(t * 0.6));
    const w1Y = height * 0.52;
    const w1W = width * 0.09;
    const w1H = height * 0.28;

    detections.push({
      box: { x: w1X - w1W * 0.2, y: w1Y - 10, w: w1W, h: w1H },
      status: 'compliant',
      label: 'Compliant Worker (Hard Hat + Vest)',
      confidence: 0.95,
      color: '#22c55e',
      isSimulated: true,
    });

    // Worker 2: PPE Violation (No Hard Hat)
    const w2X = width * (0.62 + 0.12 * Math.cos(t * 0.45));
    const w2Y = height * 0.54;
    const w2W = width * 0.09;
    const w2H = height * 0.28;

    detections.push({
      box: { x: w2X - w2W * 0.2, y: w2Y - 10, w: w2W, h: w2H },
      status: 'violation',
      label: 'PPE Violation: No Helmet Detected',
      confidence: 0.92,
      color: '#ef4444',
      isSimulated: true,
    });

    // Thermal / Smelting Hot Spot
    detections.push({
      box: { x: width * 0.38, y: height * 0.70, w: width * 0.25, h: height * 0.15 },
      status: 'warning',
      label: 'Crucible Molten Run: 1,480°C',
      confidence: 0.98,
      color: '#f59e0b',
      isSimulated: true,
    });

    return detections;
  }
}

export const demoVideoEngine = new DemoVideoEngine();
