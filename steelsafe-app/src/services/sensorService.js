/**
 * Plant Environmental Sensors Service
 * Simulates industrial IoT telemetry for steel manufacturing:
 * - Gas (CO / toxic gas in ppm) — Threshold: 35 ppm (Warning), 50 ppm (Critical)
 * - Temperature (blast/ambient °C) — Threshold: 65 °C (Warning), 85 °C (Critical)
 * - Noise (dB acoustic sound level) — Threshold: 85 dB (Warning), 100 dB (Critical)
 * - Vibration (mm/s velocity RMS) — Threshold: 4.5 mm/s (Warning), 7.0 mm/s (Critical)
 */

export const SENSOR_THRESHOLDS = {
  gas: {
    name: 'Toxic Gas (CO)',
    unit: 'ppm',
    nominal: 18,
    warning: 35,
    critical: 50,
    max: 120,
    icon: 'Flame',
  },
  temperature: {
    name: 'Ambient Temperature',
    unit: '°C',
    nominal: 42,
    warning: 65,
    critical: 85,
    max: 130,
    icon: 'Thermometer',
  },
  noise: {
    name: 'Acoustic Sound Level',
    unit: 'dB',
    nominal: 74,
    warning: 85,
    critical: 100,
    max: 130,
    icon: 'Volume2',
  },
  vibration: {
    name: 'Turbine Vibration',
    unit: 'mm/s',
    nominal: 2.4,
    warning: 4.5,
    critical: 7.0,
    max: 12.0,
    icon: 'Activity',
  },
};

/**
 * Generate a randomized delta around nominal or spiked value
 */
export function generateSensorReadings(currentValues, isSpike = false) {
  if (isSpike) {
    // Generate an emergency anomaly spike crossing threshold
    return {
      gas: Math.round(58 + Math.random() * 25), // Critical spike
      temperature: Math.round(88 + Math.random() * 18), // Critical spike
      noise: Math.round(104 + Math.random() * 12), // Critical spike
      vibration: Number((7.8 + Math.random() * 2.5).toFixed(1)), // Critical spike
      isSpike: true,
      timestamp: new Date().toISOString(),
    };
  }

  // Realistic random industrial drift
  const drift = (base, delta, min, max, precision = 0) => {
    const raw = base + (Math.random() * delta * 2 - delta);
    const clamped = Math.max(min, Math.min(max, raw));
    return precision === 0 ? Math.round(clamped) : Number(clamped.toFixed(precision));
  };

  const prev = currentValues || {
    gas: SENSOR_THRESHOLDS.gas.nominal,
    temperature: SENSOR_THRESHOLDS.temperature.nominal,
    noise: SENSOR_THRESHOLDS.noise.nominal,
    vibration: SENSOR_THRESHOLDS.vibration.nominal,
  };

  return {
    gas: drift(prev.gas, 1.8, 12, 60),
    temperature: drift(prev.temperature, 1.2, 36, 95),
    noise: drift(prev.noise, 1.5, 68, 110),
    vibration: drift(prev.vibration, 0.2, 1.5, 9.0, 1),
    isSpike: false,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Evaluate if a sensor reading violates safety thresholds
 */
export function evaluateSensorBreach(readings) {
  const breaches = [];

  if (readings.gas >= SENSOR_THRESHOLDS.gas.critical) {
    breaches.push({
      type: 'Sensor Alert: Dangerous CO Gas Level',
      severity: 'Critical',
      sensor: 'gas',
      value: `${readings.gas} ppm`,
      threshold: `${SENSOR_THRESHOLDS.gas.critical} ppm`,
      message: `Toxic CO gas level reached ${readings.gas} ppm exceeding critical threshold of ${SENSOR_THRESHOLDS.gas.critical} ppm.`,
    });
  } else if (readings.gas >= SENSOR_THRESHOLDS.gas.warning) {
    breaches.push({
      type: 'Sensor Warning: Elevated CO Gas',
      severity: 'High',
      sensor: 'gas',
      value: `${readings.gas} ppm`,
      threshold: `${SENSOR_THRESHOLDS.gas.warning} ppm`,
      message: `Elevated CO gas detected (${readings.gas} ppm).`,
    });
  }

  if (readings.temperature >= SENSOR_THRESHOLDS.temperature.critical) {
    breaches.push({
      type: 'Sensor Alert: Extreme Temperature Spike',
      severity: 'Critical',
      sensor: 'temperature',
      value: `${readings.temperature} °C`,
      threshold: `${SENSOR_THRESHOLDS.temperature.critical} °C`,
      message: `Blast ambient temperature reached ${readings.temperature} °C exceeding safe limit of ${SENSOR_THRESHOLDS.temperature.critical} °C.`,
    });
  } else if (readings.temperature >= SENSOR_THRESHOLDS.temperature.warning) {
    breaches.push({
      type: 'Sensor Warning: High Temperature',
      severity: 'High',
      sensor: 'temperature',
      value: `${readings.temperature} °C`,
      threshold: `${SENSOR_THRESHOLDS.temperature.warning} °C`,
      message: `High operating temperature detected (${readings.temperature} °C).`,
    });
  }

  if (readings.noise >= SENSOR_THRESHOLDS.noise.critical) {
    breaches.push({
      type: 'Sensor Alert: Hazardous Acoustic Noise',
      severity: 'High',
      sensor: 'noise',
      value: `${readings.noise} dB`,
      threshold: `${SENSOR_THRESHOLDS.noise.critical} dB`,
      message: `Acoustic noise surged to ${readings.noise} dB exceeding hearing protection safety limit.`,
    });
  }

  if (readings.vibration >= SENSOR_THRESHOLDS.vibration.critical) {
    breaches.push({
      type: 'Sensor Alert: Critical Machinery Vibration',
      severity: 'Critical',
      sensor: 'vibration',
      value: `${readings.vibration} mm/s`,
      threshold: `${SENSOR_THRESHOLDS.vibration.critical} mm/s`,
      message: `Severe mechanical turbine vibration (${readings.vibration} mm/s). Risk of bearing failure.`,
    });
  }

  return breaches;
}
