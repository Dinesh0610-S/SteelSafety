import React, { useState, useEffect, useRef } from 'react'
import {
  Flame, Thermometer, Volume2, Activity, Zap,
  AlertTriangle, ShieldAlert, CheckCircle2, TrendingUp, RefreshCw
} from 'lucide-react'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import {
  SENSOR_THRESHOLDS,
  generateSensorReadings,
  evaluateSensorBreach
} from '../services/sensorService'
import { useApp } from '../context/AppContext'
import { sirenEngine } from '../utils/siren'
import { clsx } from 'clsx'

export function PlantSensorsPanel() {
  const { addIncident, showToast } = useApp()

  const [readings, setReadings] = useState(() => generateSensorReadings(null, false))
  const [activeBreaches, setActiveBreaches] = useState([])
  const [isSpiking, setIsSpiking] = useState(false)
  const lastLoggedRef = useRef({})

  // Update readings every 2 seconds with realistic variation
  useEffect(() => {
    const interval = setInterval(() => {
      setReadings(prev => {
        // If spiking, keep spike for 4 seconds then decay
        const next = generateSensorReadings(prev, false)
        return next
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  // Evaluate readings for threshold breaches and log incidents
  useEffect(() => {
    const breaches = evaluateSensorBreach(readings)
    setActiveBreaches(breaches)

    if (breaches.length > 0) {
      const now = Date.now()
      breaches.forEach(b => {
        const key = `sensor_${b.sensor}_${b.severity}`
        const last = lastLoggedRef.current[key] || 0

        // Throttle duplicate sensor alerts to once every 12 seconds
        if (now - last >= 12000) {
          lastLoggedRef.current[key] = now

          // Trigger Siren for Critical sensor spikes
          if (b.severity === 'Critical') {
            sirenEngine.playSiren(2400)
          }

          // Insert incident into Lovable Cloud Database
          addIncident({
            type: b.type,
            severity: b.severity,
            confidence: 0.99,
            zone: 'Zone A - Blast Furnace Sensors',
            camera: 'Telemetry IoT Node #04',
            status: 'Open',
            owner: 'Maintenance Shift Lead',
            notes: `${b.message} (Threshold: ${b.threshold})`,
          })

          // Show Toast
          showToast({
            title: b.type,
            message: b.message,
            severity: b.severity,
            zone: 'Blast Furnace Sensors',
            variant: b.severity === 'Critical' ? 'destructive' : 'default',
          })
        }
      })
    }
  }, [readings, addIncident, showToast])

  // Trigger Instant Anomaly Spike for Demos
  const handleSimulateSpike = () => {
    setIsSpiking(true)
    const spiked = generateSensorReadings(readings, true)
    setReadings(spiked)

    // Decay after 5 seconds back to nominal
    setTimeout(() => {
      setIsSpiking(false)
    }, 5000)
  }

  // Sensor definitions
  const sensorConfigs = [
    {
      key: 'gas',
      label: 'Gas (CO)',
      unit: 'ppm',
      val: readings.gas,
      config: SENSOR_THRESHOLDS.gas,
      icon: <Flame className="size-4" />,
      color: readings.gas >= SENSOR_THRESHOLDS.gas.critical ? 'text-destructive' : readings.gas >= SENSOR_THRESHOLDS.gas.warning ? 'text-warning' : 'text-primary',
    },
    {
      key: 'temperature',
      label: 'Temperature',
      unit: '°C',
      val: readings.temperature,
      config: SENSOR_THRESHOLDS.temperature,
      icon: <Thermometer className="size-4" />,
      color: readings.temperature >= SENSOR_THRESHOLDS.temperature.critical ? 'text-destructive' : readings.temperature >= SENSOR_THRESHOLDS.temperature.warning ? 'text-warning' : 'text-sky',
    },
    {
      key: 'noise',
      label: 'Noise Level',
      unit: 'dB',
      val: readings.noise,
      config: SENSOR_THRESHOLDS.noise,
      icon: <Volume2 className="size-4" />,
      color: readings.noise >= SENSOR_THRESHOLDS.noise.critical ? 'text-destructive' : readings.noise >= SENSOR_THRESHOLDS.noise.warning ? 'text-warning' : 'text-lavender',
    },
    {
      key: 'vibration',
      label: 'Vibration',
      unit: 'mm/s',
      val: readings.vibration,
      config: SENSOR_THRESHOLDS.vibration,
      icon: <Activity className="size-4" />,
      color: readings.vibration >= SENSOR_THRESHOLDS.vibration.critical ? 'text-destructive' : readings.vibration >= SENSOR_THRESHOLDS.vibration.warning ? 'text-warning' : 'text-success',
    },
  ]

  return (
    <div className="glass rounded-2xl p-5 border border-border/80">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <Activity className="size-4" />
          </div>
          <div>
            <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
              Plant Environmental Sensors
              <span className="flex size-2 rounded-full bg-success animate-pulse" />
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Simulated IoT telemetry updating every 2s
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeBreaches.length > 0 && (
            <span className="rounded-full bg-destructive/20 border border-destructive/50 px-2.5 py-0.5 text-[10px] font-bold text-destructive animate-pulse">
              {activeBreaches.length} Hazard Breach{activeBreaches.length > 1 ? 'es' : ''}
            </span>
          )}

          <Button
            size="sm"
            variant={isSpiking ? 'default' : 'outline'}
            onClick={handleSimulateSpike}
            disabled={isSpiking}
            className={clsx(
              'gap-1.5 text-xs font-semibold',
              isSpiking ? 'bg-destructive text-white shadow-glow' : 'hover:border-primary/50'
            )}
            title="Simulate sudden hazardous toxic gas and temperature spike"
          >
            <Zap className={clsx('size-3.5', isSpiking ? 'animate-bounce' : 'text-warning')} />
            {isSpiking ? 'Anomaly Spiking...' : 'Simulate Spike'}
          </Button>
        </div>
      </div>

      {/* Sensor Tiles Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {sensorConfigs.map(s => {
          const isCritical = s.val >= s.config.critical
          const isWarn = s.val >= s.config.warning
          const pct = Math.min(100, Math.round((s.val / s.config.max) * 100))

          return (
            <div
              key={s.key}
              className={clsx(
                'glass flex flex-col gap-2 rounded-xl p-3.5 transition-all duration-300 relative overflow-hidden',
                isCritical
                  ? 'border-destructive bg-destructive/15 ring-2 ring-destructive/40 shadow-lg'
                  : isWarn
                  ? 'border-warning/70 bg-warning/10'
                  : 'border-border/70 hover:border-primary/30'
              )}
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <span className={s.color}>{s.icon}</span>
                  {s.label}
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  Lmt: {s.config.warning}
                </span>
              </div>

              {/* Value and Unit */}
              <div className="flex items-baseline gap-1 mt-1">
                <span className={clsx(
                  'font-display text-2xl font-black tabular-nums transition-colors',
                  isCritical ? 'text-destructive' : isWarn ? 'text-warning' : 'text-foreground'
                )}>
                  {s.val}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">{s.unit}</span>
              </div>

              {/* Mini Gauge Bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: isCritical
                      ? 'var(--destructive)'
                      : isWarn
                      ? 'var(--warning)'
                      : 'var(--primary)',
                    boxShadow: isCritical || isWarn ? '0 0 8px currentColor' : 'none',
                  }}
                />
              </div>

              {/* Status footer */}
              <div className="flex items-center justify-between text-[10px] pt-0.5">
                <span className={clsx(
                  'font-bold uppercase tracking-wider',
                  isCritical ? 'text-destructive animate-pulse' : isWarn ? 'text-warning' : 'text-success'
                )}>
                  {isCritical ? 'CRITICAL' : isWarn ? 'WARNING' : 'NOMINAL'}
                </span>
                <span className="text-muted-foreground">
                  {isCritical ? `>${s.config.critical}${s.unit}` : 'Safe'}
                </span>
              </div>

              {/* Red glow pulse if critical */}
              {isCritical && (
                <div className="pointer-events-none absolute inset-0 border-2 border-destructive rounded-xl animate-ping opacity-25" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
