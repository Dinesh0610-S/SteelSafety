import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
} from 'react'
import {
  Camera,
  CameraOff,
  Play,
  Square,
  AlertTriangle,
  WifiOff,
  ChevronDown,
  Activity,
  RefreshCw,
  Users,
  ShieldCheck,
  ShieldAlert,
  Gauge,
  Sliders,
  Cpu,
  MapPin,
  Sparkles,
  Layers,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Crosshair,
  RotateCcw,
  Volume2,
  VolumeX,
  Bell,
  CloudUpload,
  LayoutGrid,
  Maximize2,
  Lock,
  Siren,
  Flame
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { AccessGate } from '../components/AccessGate'
import { useApp } from '../context/AppContext'
import { loadVisionModel, analyzePersonPPE, analyzeFireSmoke } from '../utils/visionEngine'
import { zoneDatabase, isPointInPolygon } from '../services/zoneDatabase'
import { lovableCloud } from '../services/lovableCloud'
import { sirenEngine } from '../utils/siren'
import { CameraGridTile } from '../components/CameraGridTile'
import { PlantSensorsPanel } from '../components/PlantSensorsPanel'
import { EmergencySOSModal } from '../components/EmergencySOSModal'
import { demoVideoEngine, DEMO_SCENES } from '../utils/demoVideoEngine'
import { clsx } from 'clsx'

const ZONES = [
  'Zone A - Blast Furnace',
  'Zone B - Rolling Mill',
  'Zone C - Continuous Casting',
  'Zone D - Raw Material Yard',
  'Zone E - Slag Processing',
]

const COLOR_COMPLIANT = '#22c55e' // Green
const COLOR_WARNING   = '#f59e0b' // Amber
const COLOR_VIOLATION = '#ef4444' // Red

const ZONE_COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Blue', hex: '#3b82f6' },
]

const SEVERITY_BADGE = {
  Low:      'low',
  Medium:   'medium',
  High:     'high',
  Critical: 'critical',
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) || 239
  const g = parseInt(clean.substring(2, 4), 16) || 68
  const b = parseInt(clean.substring(4, 6), 16) || 68
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/**
 * Draw Zones (polygons) on canvas with semi-transparent overlays & intrusion flashing
 */
function drawZones(ctx, zones, activeIntrusionZoneIds, cw, ch) {
  const time = Date.now()
  const flash = Math.sin(time / 150) > 0 // Rapid flashing for active intrusions

  for (const zone of zones) {
    if (!zone.points || zone.points.length < 3) continue

    const isIntruding = activeIntrusionZoneIds.includes(zone.id)
    const pts = zone.points.map(p => ({ x: p.x * cw, y: p.y * ch }))

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y)
    }
    ctx.closePath()

    if (isIntruding) {
      // Flashing Red Intrusion Overlay
      ctx.fillStyle = flash ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.20)'
      ctx.fill()
      ctx.lineWidth = 3.5
      ctx.strokeStyle = '#ef4444'
      ctx.shadowColor = '#ef4444'
      ctx.shadowBlur = 16
      ctx.stroke()
    } else {
      // Normal semi-transparent zone overlay
      ctx.fillStyle = hexToRgba(zone.color || '#ef4444', 0.22)
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = hexToRgba(zone.color || '#ef4444', 0.85)
      ctx.shadowColor = zone.color || '#ef4444'
      ctx.shadowBlur = 8
      ctx.stroke()
    }
    ctx.restore()

    // Zone Label Pill
    const minX = Math.min(...pts.map(p => p.x))
    const minY = Math.min(...pts.map(p => p.y))
    const tagX = Math.max(10, minX + 6)
    const tagY = Math.max(24, minY + 6)

    ctx.save()
    const label = isIntruding
      ? `🚨 INTRUSION: ${zone.name.toUpperCase()}`
      : `${zone.name} (${zone.riskLevel})`

    ctx.font = '700 11px "Plus Jakarta Sans", system-ui'
    const textW = ctx.measureText(label).width + 16
    const labelH = 22

    ctx.fillStyle = isIntruding ? '#ef4444' : hexToRgba(zone.color || '#ef4444', 0.95)
    roundRect(ctx, tagX, tagY, textW, labelH, 4)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, tagX + 8, tagY + 15)
    ctx.restore()
  }
}

/**
 * Draw in-progress polygon while user is clicking on video
 */
function drawDrawingPolygon(ctx, drawingPoints, cw, ch) {
  if (drawingPoints.length === 0) return

  ctx.save()
  ctx.strokeStyle = '#a855f7'
  ctx.lineWidth = 2.5
  ctx.setLineDash([6, 4])
  ctx.shadowColor = '#a855f7'
  ctx.shadowBlur = 10

  ctx.beginPath()
  const first = drawingPoints[0]
  ctx.moveTo(first.x * cw, first.y * ch)
  for (let i = 1; i < drawingPoints.length; i++) {
    const pt = drawingPoints[i]
    ctx.lineTo(pt.x * cw, pt.y * ch)
  }
  ctx.stroke()

  ctx.setLineDash([])
  for (let i = 0; i < drawingPoints.length; i++) {
    const pt = drawingPoints[i]
    const px = pt.x * cw
    const py = pt.y * ch
    ctx.fillStyle = i === 0 ? '#22c55e' : '#ffffff'
    ctx.beginPath()
    ctx.arc(px, py, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Draw detection bounding boxes with SteelSafe glowing style
 */
function drawDetections(ctx, detections) {
  for (const det of detections) {
    const { x, y, w, h } = det.box
    const color = det.color || (
      det.status === 'compliant' ? COLOR_COMPLIANT
      : det.status === 'warning' ? COLOR_WARNING
      : COLOR_VIOLATION
    )
    const confPct = Math.round(det.confidence * 100)

    // Glowing Bounding Box
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.shadowColor = color
    ctx.shadowBlur = 10
    ctx.strokeRect(x, y, w, h)
    ctx.shadowBlur = 0

    // Corner brackets
    const bracketLen = Math.min(18, w * 0.25, h * 0.25)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    // Top-left
    ctx.beginPath()
    ctx.moveTo(x, y + bracketLen); ctx.lineTo(x, y); ctx.lineTo(x + bracketLen, y); ctx.stroke()
    // Top-right
    ctx.beginPath()
    ctx.moveTo(x + w - bracketLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + bracketLen); ctx.stroke()
    // Bottom-left
    ctx.beginPath()
    ctx.moveTo(x, y + h - bracketLen); ctx.lineTo(x, y + h); ctx.lineTo(x + bracketLen, y + h); ctx.stroke()
    // Bottom-right
    ctx.beginPath()
    ctx.moveTo(x + w - bracketLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - bracketLen); ctx.stroke()

    // Center point marker
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x + w / 2, y + h / 2, 4, 0, Math.PI * 2)
    ctx.fill()

    // Label pill
    const label = `${det.label} ${confPct}%`
    ctx.font = '700 12px "Plus Jakarta Sans", system-ui'
    const textMetrics = ctx.measureText(label)
    const labelW = textMetrics.width + 14
    const labelH = 22
    const labelY = y > labelH + 6 ? y - labelH - 4 : y + 4

    ctx.fillStyle = color
    roundRect(ctx, x, labelY, labelW, labelH, 5)
    ctx.fill()

    ctx.fillStyle = '#0f1016'
    ctx.fillText(label, x + 7, labelY + 15)
  }
}

export default function LiveMonitor() {
  const { addIncident, showToast, currentUser } = useApp()

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const loopTimeoutRef = useRef(null)
  const lastLoggedRef = useRef({}) // For 10s deduplication throttling
  const lastSirenTimeRef = useRef(0)
  const modelRef = useRef(null)

  // FPS calculation refs
  const frameCountRef = useRef(0)
  const lastFpsTimeRef = useRef(Date.now())

  // States
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState('')
  const [selectedZone, setSelectedZone] = useState(ZONES[0])
  const [isLive, setIsLive] = useState(false)
  const [error, setError] = useState(null)
  const [liveDetections, setLiveDetections] = useState([])
  const [newestId, setNewestId] = useState(null)

  // Siren Audio & Alerts State
  const [isMuted, setIsMuted] = useState(false)
  const [activeAlertBanner, setActiveAlertBanner] = useState(null) // { type, severity, zone }

  // User controls
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.50)
  const [modelStatus, setModelStatus] = useState('Standby')
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [simulateHazards, setSimulateHazards] = useState(false)

  // Emergency SOS Full-Screen State
  const [isEmergencyActive, setIsEmergencyActive] = useState(false)
  const [emergencyReason, setEmergencyReason] = useState('Manual Emergency SOS Button Activated')
  const [emergencySnapshot, setEmergencySnapshot] = useState(null)

  // Demo Mode States (Camera-free video simulation with clearly labeled synthetic data)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [demoScene, setDemoScene] = useState('furnace')
  const demoFrameRef = useRef(0)

  // --- ZONES FEATURE STATES ---
  const [zones, setZones] = useState([])
  const [activeIntrusionZoneIds, setActiveIntrusionZoneIds] = useState([])
  const [isDrawingZone, setIsDrawingZone] = useState(false)
  const [drawingPoints, setDrawingPoints] = useState([])
  const [showZoneManager, setShowZoneManager] = useState(false)
  const [zoneModalOpen, setZoneModalOpen] = useState(false)
  const [editingZone, setEditingZone] = useState(null)
  const [zoneForm, setZoneForm] = useState({
    name: 'Restricted Furnace Area',
    riskLevel: 'High',
    color: '#ef4444',
    restricted: true,
  })

  // Real-time KPI Counters above video
  const [stats, setStats] = useState({
    peopleDetected: 0,
    ppeCompliance: 100,
    activeViolations: 0,
    fps: 0,
    activeIntrusions: 0,
  })

  // --- CAMERA GRID VIEW STATES ---
  const [viewMode, setViewMode] = useState('single') // 'single' | 'grid'
  const [expandedCamId, setExpandedCamId] = useState(null)
  const gridPrimaryCanvasRef = useRef(null)

  // Mirror primary video + detection canvas to the grid primary tile canvas
  useEffect(() => {
    let animId
    const mirrorPrimary = () => {
      if (gridPrimaryCanvasRef.current && canvasRef.current) {
        const gCanvas = gridPrimaryCanvasRef.current
        const gCtx = gCanvas.getContext('2d')
        if (gCtx) {
          if (gCanvas.width !== 640) {
            gCanvas.width = 640
            gCanvas.height = 360
          }
          if (isLive) {
            if (isDemoMode) {
              // Demo mode: canvasRef has the full synthetic stream + HUD overlay
              gCtx.drawImage(canvasRef.current, 0, 0, gCanvas.width, gCanvas.height)
            } else if (videoRef.current && videoRef.current.readyState >= 2) {
              gCtx.drawImage(videoRef.current, 0, 0, gCanvas.width, gCanvas.height)
              gCtx.drawImage(canvasRef.current, 0, 0, gCanvas.width, gCanvas.height)
            }
          } else {
            // Standby dark background
            gCtx.fillStyle = '#0a0d14'
            gCtx.fillRect(0, 0, gCanvas.width, gCanvas.height)
            gCtx.fillStyle = '#64748b'
            gCtx.font = '12px sans-serif'
            gCtx.textAlign = 'center'
            gCtx.fillText('Camera Offline — Click Start Detection', gCanvas.width / 2, gCanvas.height / 2)
          }
        }
      }
      animId = requestAnimationFrame(mirrorPrimary)
    }
    mirrorPrimary()
    return () => cancelAnimationFrame(animId)
  }, [isLive, isDemoMode])

  // Camera feeds list for grid mode
  const cameraFeeds = [
    {
      id: 'cam-main',
      name: devices.find(d => d.deviceId === selectedDevice)?.label || 'Primary Vision Node #01',
      zone: selectedZone || 'Zone A - Blast Furnace',
      type: 'primary',
      statusColor: activeIntrusionZoneIds.length > 0 || stats.activeViolations > 0 ? 'red' : 'emerald',
      violations: stats.activeViolations + activeIntrusionZoneIds.length,
    },
    {
      id: 'cam-rolling',
      name: 'Rolling Mill Hot Line #02',
      zone: 'Zone B - Rolling Mill',
      type: 'synthetic',
      statusColor: 'amber',
      violations: 1,
    },
    {
      id: 'cam-casting',
      name: 'Continuous Casting Bay #03',
      zone: 'Zone C - Continuous Casting',
      type: 'synthetic',
      statusColor: 'red',
      violations: 2,
    },
    {
      id: 'cam-yard',
      name: 'Yard Rover Phone Node #04',
      zone: 'Zone D - Raw Material Yard',
      type: 'phone',
      statusColor: 'cyan',
      violations: 0,
    },
  ]

  const handleToggleExpand = (camId) => {
    setExpandedCamId(prev => prev === camId ? null : camId)
  }

  // Toggle Mute
  const handleToggleMute = () => {
    const next = sirenEngine.toggleMute()
    setIsMuted(next)
  }

  // Load Zones from Database
  useEffect(() => {
    const loaded = zoneDatabase.getZones()
    setZones(loaded)
  }, [])

  // Enumerate camera devices
  const enumerateCameras = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const cams = allDevices.filter(d => d.kind === 'videoinput')
      setDevices(cams)
      if (cams.length > 0 && !selectedDevice) {
        setSelectedDevice(cams[0].deviceId)
      }
      return cams
    } catch {
      return []
    }
  }, [selectedDevice])

  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      enumerateCameras()
    }
  }, [enumerateCameras])

  // Preload model on component mount
  useEffect(() => {
    let mounted = true
    setIsModelLoading(true)
    setModelStatus('Initializing model...')
    loadVisionModel(status => {
      if (mounted) setModelStatus(status)
    })
      .then(model => {
        if (mounted) {
          modelRef.current = model
          setModelStatus('Neural Model Ready (WebGL)')
          setIsModelLoading(false)
        }
      })
      .catch(err => {
        if (mounted) {
          setModelStatus('Failed to load TFJS model')
          setIsModelLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  /**
   * Capture a combined snapshot of video frame + drawn canvas overlay
   * and upload it to Lovable Cloud Storage
   */
  const captureSnapshotWithOverlay = useCallback(async () => {
    if (!canvasRef.current) return null
    const video = videoRef.current
    const canvas = canvasRef.current
    const w = canvas.width || 640
    const h = canvas.height || 360

    const offscreen = document.createElement('canvas')
    offscreen.width = w
    offscreen.height = h
    const octx = offscreen.getContext('2d')
    if (!octx) return null

    try {
      if (video && video.readyState >= 2 && !isDemoMode) {
        // 1. Draw live video frame
        octx.drawImage(video, 0, 0, w, h)
        // 2. Composite canvas detection boxes & zones
        octx.drawImage(canvas, 0, 0, w, h)
      } else {
        // Demo Mode: canvas already has full synthetic scene & bounding boxes
        octx.drawImage(canvas, 0, 0, w, h)
      }

      // Add watermark stamp if simulated demo data
      if (isDemoMode) {
        octx.save()
        octx.fillStyle = 'rgba(234, 179, 8, 0.92)'
        octx.fillRect(w - 220, 10, 210, 24)
        octx.fillStyle = '#000000'
        octx.font = 'bold 11px sans-serif'
        octx.fillText('[SIMULATED DEMO DATA]', w - 210, 26)
        octx.restore()
      }

      // 3. Upload to Lovable Cloud Storage
      const snapshotUrl = await lovableCloud.uploadSnapshot(offscreen)
      return snapshotUrl
    } catch (e) {
      console.warn('Snapshot capture failed:', e)
      return null
    }
  }, [isDemoMode])

  /**
   * Trigger full-screen red emergency state with siren, spoken warning, evacuation checklist & log entry
   */
  const triggerEmergencyState = useCallback(async (reason = 'Manual Emergency SOS Activated') => {
    setIsEmergencyActive(true)
    setEmergencyReason(reason)

    const snapshotUrl = await captureSnapshotWithOverlay()
    setEmergencySnapshot(snapshotUrl)

    const currentCamLabel = devices.find(d => d.deviceId === selectedDevice)?.label || 'Primary Vision Node #01'
    const emergencyIncident = {
      id: crypto.randomUUID(),
      type: reason.toLowerCase().includes('fire') ? 'Critical Fire & Smoke Hazard' : 'Emergency SOS: Plant Evacuation Override',
      severity: 'Critical',
      confidence: 1.0,
      zone: selectedZone || 'Zone A - Blast Furnace',
      camera: currentCamLabel,
      status: 'Open',
      snapshot_url: snapshotUrl,
      owner: currentUser?.name || 'Emergency Controller',
      notes: `${reason}. Full-screen red emergency state deployed. Siren active, spoken warning broadcast to floor, and evacuation checklist engaged.${isDemoMode ? ' [SIMULATED DEMO DATA]' : ''}`,
      created_at: new Date().toISOString(),
      resolved_at: null,
      is_simulated: isDemoMode,
    }

    try {
      const saved = await addIncident(emergencyIncident)
      setLiveDetections(prev => [saved, ...prev].slice(0, 50))
    } catch (e) {
      console.warn('Failed to insert emergency record:', e)
    }

    showToast({
      title: 'CRITICAL EMERGENCY ACTIVATED',
      message: `${reason} in ${selectedZone}. Full plant evacuation underway.`,
      severity: 'Critical',
      zone: selectedZone,
      variant: 'destructive',
    })
  }, [selectedZone, selectedDevice, devices, currentUser, isDemoMode, captureSnapshotWithOverlay, addIncident, showToast])

  /**
   * Dismiss and clear emergency state
   */
  const handleClearEmergency = useCallback(() => {
    setIsEmergencyActive(false)
    sirenEngine.stopEmergencySiren()
    showToast({
      title: 'Emergency Stood Down',
      message: 'Plant safety conditions returned to normal surveillance mode.',
      variant: 'success',
    })
  }, [showToast])

  /**
   * Deduplication violation logger (10-second throttle):
   * - Captures composite snapshot with bounding boxes & uploads to cloud storage
   * - Inserts incident to Lovable Cloud Database with status: 'Open'
   * - Plays industrial siren sound for Critical & High severity (if unmuted)
   * - Triggers flashing alert banner and toast notification
   */
  const logViolationThrottled = useCallback(async (violation) => {
    const key = `${violation.type}_${violation.zone}_${violation.camera}`
    const now = Date.now()
    const last = lastLoggedRef.current[key] || 0

    if (now - last >= 10000) {
      lastLoggedRef.current[key] = now

      // 1. Capture snapshot with drawn boxes & upload
      const snapshotUrl = await captureSnapshotWithOverlay()

      const isSim = Boolean(violation.is_simulated || isDemoMode)
      const simLabel = isSim ? '[SIMULATED] ' : ''

      // 2. Insert incident into Lovable Cloud Database with status: 'Open'
      const incidentRecord = {
        id: crypto.randomUUID(),
        type: violation.type.startsWith('[SIMULATED]') ? violation.type : `${simLabel}${violation.type}`,
        severity: violation.severity || 'High',
        confidence: violation.confidence || 0.90,
        zone: violation.zone || selectedZone,
        camera: violation.camera || 'Camera 01',
        status: 'Open',
        snapshot_url: snapshotUrl,
        owner: 'Unassigned',
        notes: `${isSim ? '[SIMULATED DEMO DATA] ' : ''}AI auto-detection in ${violation.zone} on ${violation.camera}.`,
        created_at: new Date().toISOString(),
        resolved_at: null,
        is_simulated: isSim,
      }

      const saved = await addIncident(incidentRecord)
      setLiveDetections(prev => [saved, ...prev].slice(0, 50))
      setNewestId(saved.id)
      setTimeout(() => setNewestId(null), 1500)

      // 3. Siren Audio for Critical and High severity
      if (violation.severity === 'Critical' || violation.severity === 'High') {
        if (now - lastSirenTimeRef.current >= 6000) {
          lastSirenTimeRef.current = now
          sirenEngine.playSiren(2600)
        }

        // Flashing alert banner
        setActiveAlertBanner({
          type: incidentRecord.type,
          severity: violation.severity,
          zone: violation.zone,
        })
        setTimeout(() => setActiveAlertBanner(null), 5000)
      }

      // 4. Toast notification in existing style
      showToast({
        title: `${violation.severity.toUpperCase()} ALERT: ${incidentRecord.type}`,
        message: `Detected with ${Math.round((violation.confidence || 0.9) * 100)}% confidence in ${violation.zone}. Status: Open.${isSim ? ' (SIMULATED)' : ''}`,
        severity: violation.severity,
        zone: violation.zone,
        variant: violation.severity === 'Critical' ? 'destructive' : 'default',
      })
    }
  }, [addIncident, showToast, selectedZone, isDemoMode, captureSnapshotWithOverlay])

  // Canvas Click Handler: allows user to click on the video to draw a polygon
  const handleCanvasClick = (e) => {
    if (!isDrawingZone || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    const normX = Math.max(0, Math.min(1, clickX / rect.width))
    const normY = Math.max(0, Math.min(1, clickY / rect.height))

    const newPoints = [...drawingPoints, { x: Number(normX.toFixed(3)), y: Number(normY.toFixed(3)) }]
    setDrawingPoints(newPoints)
  }

  // Complete drawing polygon
  const handleFinishDrawing = () => {
    if (drawingPoints.length < 3) {
      alert('A zone polygon requires at least 3 points. Click on the video to add vertices.')
      return
    }
    setZoneForm({
      name: `Restricted Zone ${zones.length + 1}`,
      riskLevel: 'High',
      color: '#ef4444',
      restricted: true,
    })
    setEditingZone(null)
    setZoneModalOpen(true)
  }

  // Cancel drawing
  const handleCancelDrawing = () => {
    setIsDrawingZone(false)
    setDrawingPoints([])
  }

  // Save Zone to Database (New or Edited)
  const handleSaveZone = () => {
    if (!zoneForm.name.trim()) return

    try {
      if (editingZone) {
        const updated = zoneDatabase.updateZone(editingZone.id, {
          name: zoneForm.name,
          riskLevel: zoneForm.riskLevel,
          color: zoneForm.color,
          restricted: zoneForm.restricted,
        }, currentUser)
        setZones(prev => prev.map(z => (z.id === editingZone.id ? updated : z)))
        showToast({
          title: 'Safety Zone Updated',
          message: `Zone "${zoneForm.name}" updated in database.`,
          variant: 'success',
        })
      } else {
        const newZone = zoneDatabase.addZone({
          name: zoneForm.name,
          riskLevel: zoneForm.riskLevel,
          color: zoneForm.color,
          restricted: zoneForm.restricted,
          points: drawingPoints,
        }, currentUser)
        setZones(prev => [...prev, newZone])
        showToast({
          title: 'Safety Zone Saved',
          message: `Polygon perimeter for "${zoneForm.name}" saved to database.`,
          variant: 'success',
        })
      }
    } catch (err) {
      showToast({
        title: 'Row-Level Security Error',
        message: err.message,
        variant: 'destructive',
      })
    }

    setZoneModalOpen(false)
    setIsDrawingZone(false)
    setDrawingPoints([])
    setEditingZone(null)
  }

  // Delete Zone from Database
  const handleDeleteZone = (id) => {
    try {
      const updated = zoneDatabase.deleteZone(id, currentUser)
      setZones(updated)
      showToast({
        title: 'Zone Deleted',
        message: 'Zone perimeter removed from database.',
        variant: 'default',
      })
    } catch (err) {
      showToast({
        title: 'Row-Level Security Error',
        message: err.message,
        variant: 'destructive',
      })
    }
  }

  // Open Edit Modal for a Zone
  const handleEditZone = (zone) => {
    setEditingZone(zone)
    setZoneForm({
      name: zone.name,
      riskLevel: zone.riskLevel,
      color: zone.color,
      restricted: zone.restricted,
    })
    setZoneModalOpen(true)
  }

  // Reset zones to industrial defaults
  const handleResetZones = () => {
    try {
      const defaults = zoneDatabase.resetDefaults(currentUser)
      setZones(defaults)
      showToast({
        title: 'Zones Reset',
        message: 'Restored default industrial steel safety zones.',
        variant: 'default',
      })
    } catch (err) {
      showToast({
        title: 'Row-Level Security Error',
        message: err.message,
        variant: 'destructive',
      })
    }
  }

  // Main Detection Loop: runs ~5 times per second (every ~200ms) or 30fps in Demo Mode
  const runDetectionCycle = useCallback(async () => {
    if (!canvasRef.current || !isLive) return

    // --- 0. DEMO MODE SYNTHETIC STREAM EXECUTION ---
    if (isDemoMode) {
      demoFrameRef.current++
      const canvas = canvasRef.current
      if (canvas.width !== 1280) {
        canvas.width = 1280
        canvas.height = 720
      }
      const cw = canvas.width
      const ch = canvas.height
      const ctx = canvas.getContext('2d')

      if (ctx) {
        // Render synthetic steel plant video frame
        demoVideoEngine.renderScene(ctx, cw, ch, demoScene, demoFrameRef.current)

        // Draw user zones overlay on top
        drawZones(ctx, zones, activeIntrusionZoneIds, cw, ch)

        // Simulated AI bounding boxes & alerts
        const demoBoxes = demoVideoEngine.getSimulatedDetections(cw, ch, demoScene, demoFrameRef.current)
        drawDetections(ctx, demoBoxes)

        // Periodic incident logging (~every 60 frames / 12 seconds)
        if (demoFrameRef.current % 60 === 0) {
          const simCandidates = [
            { type: 'PPE Violation: No Helmet', severity: 'High', zone: selectedZone },
            { type: 'Zone Intrusion: Crane Runway', severity: 'High', zone: selectedZone },
            { type: 'PPE Warning: No Safety Vest', severity: 'Medium', zone: selectedZone },
          ]
          const picked = simCandidates[Math.floor(Math.random() * simCandidates.length)]
          logViolationThrottled({
            type: picked.type,
            severity: picked.severity,
            confidence: 0.94,
            camera: 'Synthetic Demo Node #01',
            zone: picked.zone,
            is_simulated: true,
          })
        }

        setStats({
          peopleDetected: 2,
          ppeCompliance: 50,
          activeViolations: 1,
          fps: 29.8,
          activeIntrusions: activeIntrusionZoneIds.length,
        })
      }

      loopTimeoutRef.current = setTimeout(runDetectionCycle, 66)
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || video.readyState < 2 || video.paused || video.ended) {
      loopTimeoutRef.current = setTimeout(runDetectionCycle, 200)
      return
    }

    // Sync canvas resolution to video
    if (video.videoWidth && canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }

    const cw = canvas.width || 640
    const ch = canvas.height || 360
    const activeBoxes = []
    let detectedPeople = 0
    let compliantPeople = 0
    let violationsInFrame = 0
    const intrudingZoneIds = []

    const currentCamLabel = devices.find(d => d.deviceId === selectedDevice)?.label || 'Camera 01'

    try {
      // 1. Run in-browser neural detection
      let predictions = []
      if (modelRef.current) {
        predictions = await modelRef.current.detect(video, 10, confidenceThreshold)
      }

      // Filter persons
      const personPredictions = predictions.filter(
        p => p.class === 'person' && p.score >= confidenceThreshold
      )
      detectedPeople = personPredictions.length

      for (const p of personPredictions) {
        const [px, py, pw, ph] = p.bbox
        const ppe = analyzePersonPPE(video, px, py, pw, ph)

        // Center point of person bounding box
        const centerNorm = {
          x: (px + pw / 2) / cw,
          y: (py + ph / 2) / ch,
        }

        // Check if person's center point enters any restricted zone
        let enteredRestrictedZone = null
        for (const zone of zones) {
          if (zone.restricted !== false && isPointInPolygon(centerNorm, zone.points)) {
            enteredRestrictedZone = zone
            if (!intrudingZoneIds.includes(zone.id)) {
              intrudingZoneIds.push(zone.id)
            }
            break
          }
        }

        // Evaluate compliance & intrusions
        let status = 'compliant'
        let label = 'Compliant Worker'
        let color = COLOR_COMPLIANT

        if (enteredRestrictedZone) {
          // ZONE INTRUSION DETECTED
          status = 'violation'
          label = `INTRUSION: ${enteredRestrictedZone.name.toUpperCase()}`
          color = COLOR_VIOLATION
          violationsInFrame++

          logViolationThrottled({
            type: `Zone Intrusion: ${enteredRestrictedZone.name}`,
            severity: 'High',
            confidence: Number(p.score.toFixed(2)),
            camera: currentCamLabel,
            zone: enteredRestrictedZone.name,
          })
        } else if (!ppe.hasHelmet && !ppe.hasVest) {
          status = 'violation'
          label = 'No Helmet & No Vest'
          color = COLOR_VIOLATION
          violationsInFrame++

          logViolationThrottled({
            type: 'PPE Violation: No Helmet & Vest',
            severity: 'High',
            confidence: Number(p.score.toFixed(2)),
            camera: currentCamLabel,
            zone: selectedZone,
          })
        } else if (!ppe.hasHelmet) {
          status = 'violation'
          label = 'No Helmet'
          color = COLOR_VIOLATION
          violationsInFrame++

          logViolationThrottled({
            type: 'PPE Violation: No Helmet',
            severity: 'High',
            confidence: Number(ppe.helmetConf.toFixed(2)),
            camera: currentCamLabel,
            zone: selectedZone,
          })
        } else if (!ppe.hasVest) {
          status = 'warning'
          label = 'No Safety Vest'
          color = COLOR_WARNING

          logViolationThrottled({
            type: 'PPE Warning: No Safety Vest',
            severity: 'Medium',
            confidence: Number(ppe.vestConf.toFixed(2)),
            camera: currentCamLabel,
            zone: selectedZone,
          })
        } else {
          compliantPeople++
        }

        activeBoxes.push({
          box: { x: px, y: py, w: pw, h: ph },
          status,
          label,
          confidence: p.score,
          color,
        })
      }

      // 2. Check for fire/smoke in steel plant environment
      const fireSmoke = analyzeFireSmoke(video)
      if (fireSmoke && fireSmoke.confidence >= confidenceThreshold) {
        violationsInFrame++
        activeBoxes.push({
          box: fireSmoke.box,
          status: 'violation',
          label: 'Fire / Smoke Hazard',
          confidence: fireSmoke.confidence,
          color: COLOR_VIOLATION,
        })

        logViolationThrottled({
          type: 'Fire / Smoke Hazard',
          severity: 'Critical',
          confidence: Number(fireSmoke.confidence.toFixed(2)),
          camera: currentCamLabel,
          zone: selectedZone,
        })

        // Auto-switch UI to full-screen red emergency state on Critical fire!
        if (!isEmergencyActive) {
          triggerEmergencyState('Critical Fire & Smoke Hazard Detected in Smelting Bay')
        }
      }

      // 3. Optional Simulation overlay
      if (simulateHazards) {
        const simW = cw * 0.22
        const simH = ch * 0.48
        const simX = cw * 0.12
        const simY = ch * 0.28
        violationsInFrame++
        detectedPeople += 2
        compliantPeople += 1

        const simCenter = { x: (simX + simW / 2) / cw, y: (simY + simH / 2) / ch }
        let simIntrudedZone = zones.find(z => isPointInPolygon(simCenter, z.points)) || zones[0]
        if (simIntrudedZone && !intrudingZoneIds.includes(simIntrudedZone.id)) {
          intrudingZoneIds.push(simIntrudedZone.id)
        }

        activeBoxes.push({
          box: { x: simX, y: simY, w: simW, h: simH },
          status: 'violation',
          label: simIntrudedZone ? `INTRUSION: ${simIntrudedZone.name.toUpperCase()}` : 'No Helmet (Worker)',
          confidence: 0.95,
          color: COLOR_VIOLATION,
        })

        activeBoxes.push({
          box: { x: cw * 0.75, y: ch * 0.25, w: simW * 0.9, h: simH * 0.9 },
          status: 'compliant',
          label: 'Compliant Worker',
          confidence: 0.96,
          color: COLOR_COMPLIANT,
        })

        if (simIntrudedZone) {
          logViolationThrottled({
            type: `Zone Intrusion: ${simIntrudedZone.name}`,
            severity: 'High',
            confidence: 0.95,
            camera: currentCamLabel,
            zone: simIntrudedZone.name,
          })
        }
      }

      setActiveIntrusionZoneIds(intrudingZoneIds)

      // RENDER ALL LAYERS ON CANVAS:
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, cw, ch)
        drawZones(ctx, zones, intrudingZoneIds, cw, ch)
        if (isDrawingZone) {
          drawDrawingPolygon(ctx, drawingPoints, cw, ch)
        }
        drawDetections(ctx, activeBoxes)
      }

      // Update FPS calculation
      frameCountRef.current++
      const now = Date.now()
      const elapsed = (now - lastFpsTimeRef.current) / 1000
      let currentFps = stats.fps
      if (elapsed >= 1.0) {
        currentFps = Number((frameCountRef.current / elapsed).toFixed(1))
        frameCountRef.current = 0
        lastFpsTimeRef.current = now
      }

      // Update KPI counters
      const complianceRate = detectedPeople > 0
        ? Math.round((compliantPeople / detectedPeople) * 100)
        : 100

      setStats({
        peopleDetected: detectedPeople,
        ppeCompliance: complianceRate,
        activeViolations: violationsInFrame,
        fps: currentFps || 5.1,
        activeIntrusions: intrudingZoneIds.length,
      })
    } catch (err) {
      console.error('Detection loop error:', err)
    }

    loopTimeoutRef.current = setTimeout(runDetectionCycle, 200)
  }, [
    isLive,
    confidenceThreshold,
    selectedDevice,
    selectedZone,
    devices,
    zones,
    isDrawingZone,
    drawingPoints,
    simulateHazards,
    isDemoMode,
    demoScene,
    isEmergencyActive,
    triggerEmergencyState,
    logViolationThrottled,
    stats.fps,
  ])

  // Start video stream
  const startStream = useCallback(async () => {
    setError(null)
    try {
      const constraints = {
        video: {
          deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
          facingMode: selectedDevice ? undefined : { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      await enumerateCameras()
      setIsLive(true)
    } catch (err) {
      console.error('Camera stream error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('permission')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('notfound')
      } else {
        setError('generic')
      }
    }
  }, [selectedDevice, enumerateCameras])

  // Stop video stream
  const stopStream = useCallback(() => {
    clearTimeout(loopTimeoutRef.current)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
    setIsLive(false)
    setActiveIntrusionZoneIds([])
    setActiveAlertBanner(null)
    setStats({
      peopleDetected: 0,
      ppeCompliance: 100,
      activeViolations: 0,
      fps: 0,
      activeIntrusions: 0,
    })
  }, [])

  // Trigger loop when live starts
  useEffect(() => {
    if (isLive) {
      loopTimeoutRef.current = setTimeout(runDetectionCycle, 200)
    } else {
      clearTimeout(loopTimeoutRef.current)
    }
    return () => clearTimeout(loopTimeoutRef.current)
  }, [isLive, runDetectionCycle])

  // Cleanup on unmount
  useEffect(() => () => stopStream(), [stopStream])

  // Toggle Camera-Free Demo Mode
  const handleToggleDemoMode = useCallback(() => {
    setIsDemoMode(prev => {
      const next = !prev
      if (next) {
        // Stop physical camera if active
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop())
          streamRef.current = null
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null
        }
        setError(null)
        setIsLive(true)
        setModelStatus('Synthetic Demo Vision (WebGL Sim)')
        showToast({
          title: 'Demo Mode Activated',
          message: 'Running built-in steel plant simulation with automated incident generation. All data clearly labeled as simulated.',
          variant: 'default',
        })
      } else {
        stopStream()
        setModelStatus('Standby')
        showToast({
          title: 'Demo Mode Deactivated',
          message: 'Returned to live physical camera surveillance.',
          variant: 'default',
        })
      }
      return next
    })
  }, [stopStream, showToast])

  // Manual Emergency SOS Trigger Button
  const handleTriggerManualSOS = async () => {
    await triggerEmergencyState('Manual Plant SOS Emergency Button Pressed')
  }

  if (!currentUser) {
    return <AccessGate pageName="Live Safety Monitor" />
  }

  const isAdmin = currentUser.role === 'Admin'

  return (
    <div>
      {/* ── Fullscreen Emergency / SOS State Modal ── */}
      <EmergencySOSModal
        isOpen={isEmergencyActive}
        triggerReason={emergencyReason}
        zone={selectedZone}
        camera={devices.find(d => d.deviceId === selectedDevice)?.label || (isDemoMode ? 'Synthetic Demo Node #01' : 'Primary Vision Node #01')}
        snapshotUrl={emergencySnapshot}
        onClearEmergency={handleClearEmergency}
        currentUser={currentUser}
      />

      {/* ── Flashing Alert Banner for High / Critical Violations ── */}
      {activeAlertBanner && (
        <div className="mb-4 glass flex items-center justify-between rounded-2xl border-2 border-destructive bg-destructive/25 px-5 py-3 text-destructive shadow-2xl animate-pulse">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-destructive text-white shadow-lg">
              <ShieldAlert className="size-5" />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-wider text-destructive">
                {activeAlertBanner.severity} SAFETY ALERT: {activeAlertBanner.type}
              </p>
              <p className="text-xs text-foreground/80 font-medium">
                Captured in {activeAlertBanner.zone} · Incident registered to Lovable Cloud
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block rounded-full bg-destructive/30 px-3 py-1 text-[11px] font-bold text-destructive">
              SIREN SOUNDING
            </span>
            <button
              onClick={() => setActiveAlertBanner(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Live Monitor
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Continuous local AI safety detection with Lovable Cloud automated incident capture
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Emergency SOS Button */}
          <Button
            size="sm"
            variant="destructive"
            onClick={handleTriggerManualSOS}
            className="gap-1.5 text-xs font-black bg-destructive text-white hover:bg-destructive/90 shadow-[0_0_18px_rgba(239,68,68,0.6)] animate-pulse border border-red-500/50"
            title="Trigger immediate full-screen emergency evacuation state with sirens, voice alerts, and incident logging"
          >
            <Siren className="size-4 animate-bounce" />
            <span>Emergency / SOS</span>
          </Button>

          {/* Demo Mode Toggle */}
          <button
            type="button"
            onClick={handleToggleDemoMode}
            className={clsx(
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition border',
              isDemoMode
                ? 'border-amber-500/60 bg-amber-500/20 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.35)]'
                : 'glass border-border text-muted-foreground hover:text-foreground'
            )}
            title="Toggle camera-free demonstration mode with synthetic video feeds and automated incident generation"
          >
            <Sparkles className={clsx('size-3.5', isDemoMode ? 'text-amber-400' : 'text-muted-foreground')} />
            <span>Demo Mode: {isDemoMode ? 'ON' : 'OFF'}</span>
          </button>

          {/* Audio Siren Mute Toggle */}
          <button
            onClick={handleToggleMute}
            className={clsx(
              'glass grid size-9 place-items-center rounded-xl border transition',
              isMuted ? 'border-border text-muted-foreground' : 'border-primary/50 text-primary bg-primary/10'
            )}
            title={isMuted ? 'Unmute Siren Alarm' : 'Mute Siren Alarm'}
          >
            {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4 animate-pulse" />}
          </button>

          {/* Zones Manager Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowZoneManager(s => !s)}
            className="gap-1.5 text-xs font-semibold"
          >
            <Layers className="size-3.5 text-primary" />
            <span>Zones ({zones.length})</span>
            {activeIntrusionZoneIds.length > 0 && (
              <span className="flex size-2 animate-ping rounded-full bg-red-500" />
            )}
          </Button>

          {/* Model Status Indicator */}
          <div className="glass flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs">
            <Cpu className="size-3.5 text-primary" />
            <span className="text-muted-foreground">AI:</span>
            <span className="font-medium text-foreground">{modelStatus}</span>
            {isModelLoading && (
              <span className="inline-block size-1.5 animate-ping rounded-full bg-primary" />
            )}
          </div>

          {/* Status Badge */}
          <Badge
            variant={isLive ? 'live' : 'offline'}
            className="gap-1.5 px-3 py-1.5 text-xs font-semibold"
          >
            {isLive && (
              <span className="inline-block size-2 animate-pulse rounded-full bg-white" />
            )}
            {isLive ? 'Live' : 'Offline'}
          </Badge>
        </div>
      </div>

      {/* ── Demo Mode Active Banner & Simulated Control Strip ── */}
      {isDemoMode && (
        <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-lg backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-black uppercase text-amber-300 border border-amber-500/40 tracking-wider">
                DEMO MODE · SIMULATED DATA
              </span>
              <p className="text-xs text-amber-200/90 font-medium hidden sm:inline">
                Camera-free synthetic video active · All generated incidents are clearly labeled as simulated
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Scene Switcher */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-muted-foreground">Scene:</span>
                <select
                  value={demoScene}
                  onChange={e => setDemoScene(e.target.value)}
                  className="glass rounded-xl px-2.5 py-1 text-xs text-amber-200 border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  {DEMO_SCENES.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Trigger Simulated Intrusion */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  logViolationThrottled({
                    type: 'Zone Intrusion: Furnace Crucible Area',
                    severity: 'High',
                    confidence: 0.96,
                    camera: 'Synthetic Demo Node #01',
                    zone: selectedZone,
                    is_simulated: true,
                  })
                }}
                className="border-amber-500/50 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 text-xs font-bold"
              >
                Simulate Intrusion
              </Button>

              {/* Trigger Simulated Critical Fire (Emergency SOS) */}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  triggerEmergencyState('Critical Fire & Smoke Hazard in Smelting Bay')
                }}
                className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold gap-1.5 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
              >
                <Flame className="size-3.5" />
                <span>Simulate Critical Fire (SOS)</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Live Counters Above Video ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* People detected */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4 text-sky" />
            <span className="text-xs uppercase tracking-wider font-semibold">People Detected</span>
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-foreground">
            {stats.peopleDetected}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">In active frame</div>
        </div>

        {/* PPE Compliance % */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="size-4 text-success" />
            <span className="text-xs uppercase tracking-wider font-semibold">PPE Compliance</span>
          </div>
          <div className={clsx(
            'mt-2 font-display text-3xl font-bold',
            stats.ppeCompliance >= 90 ? 'text-success' : stats.ppeCompliance >= 70 ? 'text-warning' : 'text-destructive'
          )}>
            {stats.ppeCompliance}%
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">Helmet & vest verified</div>
        </div>

        {/* Active Violations & Intrusions */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldAlert className="size-4 text-destructive" />
            <span className="text-xs uppercase tracking-wider font-semibold">Active Violations</span>
          </div>
          <div className={clsx(
            'mt-2 font-display text-3xl font-bold flex items-center gap-2',
            stats.activeViolations > 0 ? 'text-destructive' : 'text-foreground'
          )}>
            <span>{stats.activeViolations}</span>
            {activeIntrusionZoneIds.length > 0 && (
              <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-[11px] font-bold text-destructive animate-pulse">
                {activeIntrusionZoneIds.length} Intrusion{activeIntrusionZoneIds.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">Hazards & restricted zones</div>
        </div>

        {/* FPS */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Gauge className="size-4 text-primary" />
            <span className="text-xs uppercase tracking-wider font-semibold">Model FPS</span>
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-foreground">
            {isLive ? stats.fps : '0.0'}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">~5 Hz detection rate</div>
        </div>
      </div>

      {/* ── Active Drawing Mode Banner ── */}
      {isDrawingZone && (
        <div className="mb-4 glass flex flex-wrap items-center justify-between gap-3 rounded-2xl border-primary/50 bg-primary/10 p-4">
          <div className="flex items-center gap-3">
            <Crosshair className="size-5 text-primary animate-spin" style={{ animationDuration: '6s' }} />
            <div>
              <p className="text-sm font-bold text-foreground">
                Drawing Safety Polygon — Click directly on the video
              </p>
              <p className="text-xs text-muted-foreground">
                {drawingPoints.length} point{drawingPoints.length !== 1 ? 's' : ''} added. Click at least 3 points to define the restricted perimeter.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleFinishDrawing}
              disabled={drawingPoints.length < 3}
              className="shadow-glow gap-1.5"
            >
              <Check className="size-3.5" /> Save Polygon
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancelDrawing}
              className="gap-1.5"
            >
              <X className="size-3.5" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Main Grid: Video + Controls + Live Feed ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: Video Panel */}
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* View Switcher: Single vs Grid */}
                <div className="flex items-center rounded-xl border border-border bg-background/80 p-0.5 shadow-inner">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('single')
                      setExpandedCamId(null)
                    }}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                      viewMode === 'single'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Maximize2 className="size-3" />
                    Single View
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                      viewMode === 'grid'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <LayoutGrid className="size-3" />
                    Camera Grid (4)
                  </button>
                </div>

                {/* Camera Selector */}
                <div className="relative flex items-center">
                  <Camera className="pointer-events-none absolute left-3 size-4 text-primary" />
                  <select
                    value={selectedDevice}
                    onChange={e => setSelectedDevice(e.target.value)}
                    disabled={isLive}
                    className="glass rounded-xl py-1.5 pl-9 pr-8 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    {devices.length === 0 ? (
                      <option>Default Camera</option>
                    ) : (
                      devices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" />
                </div>

                {/* Zone Draw Action (Single View only, Admin only) */}
                {viewMode === 'single' && (
                  !isAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="gap-1.5 text-xs opacity-60 cursor-not-allowed"
                      title="Admin role required to configure zones"
                    >
                      <Lock className="size-3 text-muted-foreground" /> Draw Zone (Admin Only)
                    </Button>
                  ) : !isDrawingZone ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIsDrawingZone(true)
                        setDrawingPoints([])
                      }}
                      className="gap-1.5 text-xs"
                      title="Click to draw a safety boundary on the video"
                    >
                      <Plus className="size-3.5 text-primary" /> Draw Zone
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleCancelDrawing}
                      className="gap-1.5 text-xs"
                    >
                      <X className="size-3.5" /> Stop Drawing
                    </Button>
                  )
                )}
              </div>

              {/* Start / Stop and Simulation Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={simulateHazards ? 'default' : 'outline'}
                  onClick={() => setSimulateHazards(s => !s)}
                  className="gap-1.5 text-xs"
                  title="Toggle simulated PPE hazards and zone intrusions"
                >
                  <Sparkles className="size-3.5" />
                  {simulateHazards ? 'Simulation Active' : 'Simulate Hazards'}
                </Button>

                {!isLive ? (
                  <Button
                    size="sm"
                    className="shadow-glow gap-1.5 font-bold"
                    onClick={isDemoMode ? () => setIsLive(true) : startStream}
                  >
                    <Play className="size-3.5 fill-current" /> {isDemoMode ? 'Start Demo Stream' : 'Start Detection'}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 font-bold"
                    onClick={stopStream}
                  >
                    <Square className="size-3.5 fill-current" /> Stop {isDemoMode ? 'Demo' : ''}
                  </Button>
                )}
              </div>
            </div>

            {/* Camera Grid Viewport (up to 4 camera feeds) */}
            {viewMode === 'grid' && (
              <div className="p-3 bg-black/40">
                {expandedCamId && (
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-foreground">
                      Full View: {cameraFeeds.find(c => c.id === expandedCamId)?.name}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedCamId(null)}
                      className="text-xs gap-1 py-1 h-7"
                    >
                      <LayoutGrid className="size-3" /> 4-Cam Grid
                    </Button>
                  </div>
                )}
                <div
                  className={clsx(
                    'grid gap-3',
                    expandedCamId ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
                  )}
                >
                  {cameraFeeds
                    .filter(c => expandedCamId === null || c.id === expandedCamId)
                    .map(cam => (
                      <CameraGridTile
                        key={cam.id}
                        cam={cam}
                        isExpanded={expandedCamId === cam.id}
                        onToggleExpand={handleToggleExpand}
                        activeVideoRef={gridPrimaryCanvasRef}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Single Video + Canvas Viewport (Always kept mounted so video stream & detection loop run continuously) */}
            <div
              className={clsx(
                'relative w-full overflow-hidden bg-black/90 select-none',
                isDrawingZone ? 'cursor-crosshair' : 'cursor-default',
                viewMode === 'grid' ? 'hidden' : 'block'
              )}
              style={{ aspectRatio: '16/9' }}
              onClick={handleCanvasClick}
            >
              {/* Offline Placeholder */}
              {!isLive && !error && !isDemoMode && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="glass grid size-16 place-items-center rounded-2xl">
                    <CameraOff className="size-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-display text-lg font-bold text-foreground">
                      Vision Monitor Offline
                    </p>
                    <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                      Click <strong>Start Detection</strong> to stream live camera frames into the local neural detector, or enable <strong>Demo Mode</strong> for camera-free testing.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Handlers */}
              {error && !isDemoMode && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  {error === 'permission' ? (
                    <>
                      <div className="glass grid size-16 place-items-center rounded-2xl border-destructive/50">
                        <CameraOff className="size-8 text-destructive" />
                      </div>
                      <p className="font-display text-lg font-bold text-foreground">Camera Access Denied</p>
                      <p className="max-w-md text-xs text-muted-foreground">
                        Please allow camera permissions in your browser address bar to stream frames locally into the model, or toggle <strong>Demo Mode</strong> above.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="glass grid size-16 place-items-center rounded-2xl border-warning/50">
                        <WifiOff className="size-8 text-warning" />
                      </div>
                      <p className="font-display text-lg font-bold text-foreground">No Camera Found</p>
                      <p className="max-w-md text-xs text-muted-foreground">
                        Connect an external webcam or verify device permissions, or toggle <strong>Demo Mode</strong> to test without hardware.
                      </p>
                    </>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={startStream} className="gap-1.5">
                      <RefreshCw className="size-3.5" /> Retry Camera
                    </Button>
                    <Button size="sm" onClick={handleToggleDemoMode} className="gap-1.5 shadow-glow">
                      <Sparkles className="size-3.5" /> Launch Demo Mode
                    </Button>
                  </div>
                </div>
              )}

              {/* Video Element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={clsx(
                  'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
                  isLive && !isDemoMode ? 'opacity-100' : 'opacity-0'
                )}
              />

              {/* Canvas Overlay for Detection Boxes, Polygons & Intrusions */}
              <canvas
                ref={canvasRef}
                className={clsx(
                  'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
                  isLive ? 'opacity-100' : 'opacity-0'
                )}
              />

              {/* Active REC & Status Indicator */}
              {isLive && (
                <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                  <span className="size-2 animate-ping rounded-full bg-red-500" />
                  <span>{isDemoMode ? 'DEMO MODE · SIMULATED 30 FPS' : '5 FPS AI SCAN'}</span>
                </div>
              )}

              {/* Intrusion Alert Banner across bottom of video */}
              {activeIntrusionZoneIds.length > 0 && (
                <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-xl border border-destructive bg-destructive/90 px-4 py-2 text-white shadow-lg backdrop-blur-md animate-pulse">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-5 shrink-0" />
                    <span className="text-xs font-bold">
                      RESTRICTED ZONE INTRUSION DETECTED — {activeIntrusionZoneIds.length} ACTIVE BREACH
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider">High Severity Alert</span>
                </div>
              )}
            </div>

            {/* Threshold Slider Footer */}
            <div className="border-t border-border bg-card/40 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Sliders className="size-4 text-primary" />
                  <span>Confidence Threshold:</span>
                  <span className="font-bold text-foreground">
                    {Math.round(confidenceThreshold * 100)}%
                  </span>
                  {!isAdmin && (
                    <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.2 rounded">
                      (Admin Locked)
                    </span>
                  )}
                </div>
                <div className="flex flex-1 max-w-xs items-center gap-3">
                  <span className="text-[10px] text-muted-foreground">30%</span>
                  <input
                    type="range"
                    min="0.30"
                    max="0.90"
                    step="0.05"
                    disabled={!isAdmin}
                    value={confidenceThreshold}
                    onChange={e => setConfidenceThreshold(parseFloat(e.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-[10px] text-muted-foreground">90%</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Zones Manager Panel */}
          {showZoneManager && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  <h3 className="font-display font-bold text-sm text-foreground">Industrial Safety Zones</h3>
                </div>
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleResetZones}
                      className="gap-1 text-xs"
                      title="Restore default industrial steel plant safety zones"
                    >
                      <RotateCcw className="size-3" /> Defaults
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setIsDrawingZone(true)
                        setDrawingPoints([])
                      }}
                      className="gap-1 text-xs shadow-glow"
                    >
                      <Plus className="size-3" /> New Zone
                    </Button>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-semibold bg-muted/60 px-2 py-0.5 rounded-full">
                    Admin Role Required to Edit
                  </span>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {zones.map(z => {
                  const isIntruding = activeIntrusionZoneIds.includes(z.id)
                  return (
                    <div
                      key={z.id}
                      className={clsx(
                        'flex items-center justify-between rounded-xl border p-3 transition',
                        isIntruding ? 'border-destructive bg-destructive/15' : 'border-border bg-card/60'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="size-3.5 rounded-full shrink-0 shadow-sm"
                          style={{ background: z.color || '#ef4444' }}
                        />
                        <div>
                          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            {z.name}
                            {isIntruding && (
                              <span className="rounded bg-destructive px-1.5 py-0.2 text-[9px] font-black text-white animate-pulse">
                                INTRUDED
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {z.riskLevel} Risk · {z.points?.length || 0} vertices · {z.restricted ? 'Restricted' : 'Monitored'}
                          </p>
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditZone(z)}
                            className="grid size-7 place-items-center rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
                            title="Edit Zone"
                          >
                            <Edit2 className="size-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteZone(z.id)}
                            className="grid size-7 place-items-center rounded-lg border border-border hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                            title="Delete Zone"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Plant Environmental Sensors Panel (Gas, Temp, Noise, Vibration) */}
          <PlantSensorsPanel />
        </div>

        {/* Right: Real-time Detections & Cloud Incident Feed */}
        <Card className="flex flex-col h-[640px]">
          <CardHeader className="border-b border-border pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CloudUpload className="size-4 text-primary" />
                Live Incidents (Cloud)
              </CardTitle>
              {liveDetections.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-semibold">
                  {liveDetections.length} recorded
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Snapshots saved with status: <strong className="text-destructive">Open</strong>
            </p>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-3">
            {liveDetections.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-20 text-center">
                <Activity className="size-8 opacity-20 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">
                  {isLive ? 'Scanning video frames...' : 'No incidents recorded'}
                </p>
                <p className="max-w-[220px] text-xs text-muted-foreground">
                  {isLive
                    ? 'Violations & intrusions will auto-capture snapshots and post to Lovable Cloud.'
                    : 'Start the live camera to begin logging.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {liveDetections.map(det => {
                  const isIntrusion = det.type.toLowerCase().includes('intrusion')
                  return (
                    <div
                      key={det.id}
                      className={clsx(
                        'flex flex-col gap-1.5 rounded-xl border p-3 transition-all duration-300',
                        isIntrusion
                          ? 'border-destructive/60 bg-destructive/10'
                          : det.id === newestId
                          ? 'bg-accent border-primary/50 scale-[1.02]'
                          : 'border-border bg-card/50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={clsx(
                          'truncate text-xs font-bold',
                          isIntrusion ? 'text-destructive' : 'text-foreground'
                        )}>
                          {det.type}
                        </span>
                        <Badge variant={SEVERITY_BADGE[det.severity] || 'default'}>
                          {det.severity}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="truncate max-w-[170px]">{det.zone}</span>
                        <span className="tabular-nums">
                          {new Date(det.created_at || det.timestamp || det.time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Snapshot thumbnail if captured */}
                      {det.snapshot_url && (
                        <div className="mt-1 h-16 w-full overflow-hidden rounded-lg border border-border bg-black">
                          <img
                            src={det.snapshot_url}
                            alt="Snapshot"
                            className="size-full object-cover"
                          />
                        </div>
                      )}

                      <div className="mt-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.round(det.confidence * 100)}%`,
                                background: det.severity === 'Critical' || det.severity === 'High' ? COLOR_VIOLATION : COLOR_WARNING,
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                            {Math.round(det.confidence * 100)}%
                          </span>
                        </div>
                        <span className="rounded-full bg-destructive/15 px-2 py-0.2 text-[10px] font-bold text-destructive">
                          {det.status || 'Open'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── ZONE CONFIGURATION MODAL ── */}
      {zoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="glass w-full max-w-md rounded-2xl border border-border p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h3 className="font-display text-lg font-bold text-foreground">
                {editingZone ? 'Edit Safety Zone' : 'Save Safety Zone'}
              </h3>
              <button
                onClick={() => setZoneModalOpen(false)}
                className="grid size-8 place-items-center rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Zone Name</label>
                <input
                  type="text"
                  value={zoneForm.name}
                  onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })}
                  placeholder="e.g. Furnace Area, Crane Path, Casting Bay"
                  className="glass mt-1.5 w-full rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Risk Level</label>
                <select
                  value={zoneForm.riskLevel}
                  onChange={e => setZoneForm({ ...zoneForm, riskLevel: e.target.value })}
                  className="glass mt-1.5 w-full rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Critical">Critical (Zero Tolerance Perimeter)</option>
                  <option value="High">High (Restricted Heavy Machinery)</option>
                  <option value="Medium">Medium (Caution / PPE Required)</option>
                  <option value="Low">Low (General Transit Zone)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Zone Boundary Color</label>
                <div className="mt-2 flex gap-3">
                  {ZONE_COLORS.map(c => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setZoneForm({ ...zoneForm, color: c.hex })}
                      className={clsx(
                        'size-7 rounded-full transition-transform',
                        zoneForm.color === c.hex ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'opacity-70 hover:opacity-100'
                      )}
                      style={{ background: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <label className="mt-1 flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={zoneForm.restricted}
                  onChange={e => setZoneForm({ ...zoneForm, restricted: e.target.checked })}
                  className="size-4 rounded accent-primary"
                />
                <span>Trigger High-Severity Intrusion Alert on Worker Entry</span>
              </label>

              <div className="mt-4 flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoneModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="shadow-glow"
                  onClick={handleSaveZone}
                >
                  {editingZone ? 'Update Zone' : 'Save to Database'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
