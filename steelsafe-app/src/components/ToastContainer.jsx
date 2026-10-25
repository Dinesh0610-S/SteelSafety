import React from 'react'
import { AlertTriangle, ShieldAlert, CheckCircle, Info, X } from 'lucide-react'
import { clsx } from 'clsx'

export function ToastContainer({ toasts }) {
  if (!toasts || toasts.length === 0) return null

  return (
    <div className="fixed right-4 top-20 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
      {toasts.map(t => {
        const isCritical = t.severity === 'Critical' || t.variant === 'destructive'
        const isHigh = t.severity === 'High'
        const isSuccess = t.variant === 'success'

        return (
          <div
            key={t.id}
            className={clsx(
              'glass pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-2xl transition-all duration-300 animate-in slide-in-from-top-3',
              isCritical
                ? 'border-destructive bg-destructive/20 text-destructive'
                : isHigh
                ? 'border-warning/70 bg-warning/15 text-warning'
                : isSuccess
                ? 'border-success/60 bg-success/15 text-success'
                : 'border-border bg-card/90 text-foreground'
            )}
          >
            <div className="shrink-0 mt-0.5">
              {isCritical ? (
                <ShieldAlert className="size-5 text-destructive animate-pulse" />
              ) : isHigh ? (
                <AlertTriangle className="size-5 text-warning" />
              ) : isSuccess ? (
                <CheckCircle className="size-5 text-success" />
              ) : (
                <Info className="size-5 text-primary" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight text-foreground">
                {t.title || t.type || 'Safety Alert'}
              </p>
              {t.message && (
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                  {t.message}
                </p>
              )}
              {t.zone && (
                <span className="mt-1.5 inline-block rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {t.zone}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
