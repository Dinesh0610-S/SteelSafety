import React, { useRef, useEffect } from 'react'
import {
  Camera, Maximize2, Minimize2, Video, Smartphone,
  ShieldAlert, ShieldCheck, Flame, AlertTriangle
} from 'lucide-react'
import { clsx } from 'clsx'

export function CameraGridTile({
  cam,
  isExpanded,
  onToggleExpand,
  activeVideoRef,
}) {
  const localVideoRef = useRef(null)

  // Demo synthetic video animation for secondary feeds if live
  useEffect(() => {
    if (cam.type === 'primary') return
    const canvas = localVideoRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId
    let frame = 0
    const renderDemoFeed = () => {
      frame++
      ctx.fillStyle = cam.type === 'phone' ? '#141724' : '#1c1322'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Technical grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = 1
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
      }

      // Moving scanning element
      const scanY = (frame * 1.5) % canvas.height
      ctx.strokeStyle = cam.statusColor || '#38bdf8'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, scanY); ctx.lineTo(canvas.width, scanY); ctx.stroke()

      // Demo worker / machinery shapes
      if (cam.id === 'cam-rolling') {
        // Rolling mill metal slab
        const slabX = (frame * 2) % (canvas.width + 100) - 50
        ctx.fillStyle = '#f97316'
        ctx.fillRect(slabX, canvas.height * 0.55, 90, 24)
        ctx.shadowColor = '#f97316'; ctx.shadowBlur = 15
        ctx.strokeRect(slabX, canvas.height * 0.55, 90, 24)
        ctx.shadowBlur = 0
      }

      if (cam.id === 'cam-yard') {
        // Forklift / transit motion
        const carX = canvas.width - ((frame * 1.2) % (canvas.width + 80))
        ctx.fillStyle = '#06b6d4'
        ctx.fillRect(carX, canvas.height * 0.65, 50, 30)
      }

      // Timestamp watermark
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.fillText(`CAM_${cam.id.toUpperCase()} · ${new Date().toLocaleTimeString()}`, 10, 20)

      animId = requestAnimationFrame(renderDemoFeed)
    }

    renderDemoFeed()
    return () => cancelAnimationFrame(animId)
  }, [cam])

  const statusBg =
    cam.statusColor === 'red' || cam.violations > 0
      ? 'border-destructive bg-destructive/10'
      : cam.statusColor === 'amber'
      ? 'border-warning/60 bg-warning/10'
      : 'border-border bg-card/60'

  return (
    <div
      className={clsx(
        'glass group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-300',
        statusBg,
        isExpanded ? 'col-span-full row-span-2' : ''
      )}
    >
      {/* Top Header of Tile */}
      <div className="flex items-center justify-between border-b border-border/60 bg-black/40 px-3 py-2 z-10">
        <div className="flex items-center gap-2">
          {cam.type === 'phone' ? (
            <Smartphone className="size-3.5 text-sky" />
          ) : cam.type === 'primary' ? (
            <Camera className="size-3.5 text-primary" />
          ) : (
            <Video className="size-3.5 text-lavender" />
          )}
          <span className="text-xs font-bold text-foreground truncate max-w-[140px]">
            {cam.name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Violations Count Badge */}
          {cam.violations > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-destructive px-2 py-0.2 text-[10px] font-black text-white shadow-sm animate-pulse">
              <ShieldAlert className="size-3" /> {cam.violations} Hazard{cam.violations > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.2 text-[10px] font-bold text-success">
              <ShieldCheck className="size-3" /> Safe
            </span>
          )}

          {/* Expand / Minimize Button */}
          <button
            onClick={() => onToggleExpand(cam.id)}
            className="grid size-6 place-items-center rounded-md border border-border/70 hover:bg-accent text-muted-foreground hover:text-foreground transition"
            title={isExpanded ? 'Collapse Feed Tile' : 'Expand Feed Tile to Full Size'}
          >
            {isExpanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </button>
        </div>
      </div>

      {/* Video Content Viewport */}
      <div className="relative w-full flex-1 overflow-hidden bg-black aspect-video flex items-center justify-center">
        {cam.type === 'primary' ? (
          // Mirror primary camera video or mirror canvas
          <canvas
            ref={activeVideoRef}
            className="size-full object-cover"
          />
        ) : (
          <canvas
            ref={localVideoRef}
            width={480}
            height={270}
            className="size-full object-cover"
          />
        )}

        {/* Live Watermark Overlay */}
        <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
          <span
            className={clsx(
              'size-1.5 rounded-full',
              cam.violations > 0 ? 'bg-destructive animate-ping' : 'bg-success'
            )}
          />
          <span>{cam.zone}</span>
        </div>
      </div>
    </div>
  )
}
