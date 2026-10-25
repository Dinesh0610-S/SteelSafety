import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, Check, Trash2, Settings, ExternalLink,
  ShieldAlert, ShieldCheck, Flame, AlertTriangle, Clock
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Badge } from './ui/Badge'
import { clsx } from 'clsx'

const SEVERITY_DOT = {
  Critical: 'bg-destructive',
  High: 'bg-warning',
  Medium: 'bg-sky',
  Low: 'bg-success',
}

const SEVERITY_BADGE = {
  Critical: 'destructive',
  High: 'warning',
  Medium: 'sky',
  Low: 'success',
}

export function NotificationBell() {
  const {
    notifications,
    unreadNotificationsCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    clearNotifications,
  } = useApp()

  const [isOpen, setIsOpen] = useState(false)
  const bellRef = useRef(null)
  const navigate = useNavigate()

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = (notif) => {
    markNotificationAsRead(notif.id)
    setIsOpen(false)
    navigate('/incidents')
  }

  return (
    <div className="relative" ref={bellRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open Notifications"
        className={clsx(
          'relative grid size-9 place-items-center rounded-lg border transition text-foreground',
          isOpen
            ? 'border-primary/60 bg-accent text-primary'
            : 'border-border bg-background/50 hover:bg-accent'
        )}
      >
        <Bell className="size-4" />

        {/* Unread Badge Counter */}
        {unreadNotificationsCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-black text-white shadow-sm animate-pulse">
            {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
          </span>
        )}
      </button>

      {/* Notifications Popover Dropdown */}
      {isOpen && (
        <div className="glass absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border shadow-2xl z-50 animate-in fade-in flex flex-col overflow-hidden max-h-[500px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-card/60 p-3.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-bold text-foreground">
                Notifications
              </span>
              {unreadNotificationsCount > 0 && (
                <span className="rounded-full bg-destructive/15 px-2 py-0.2 text-[10px] font-bold text-destructive">
                  {unreadNotificationsCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadNotificationsCount > 0 && (
                <button
                  onClick={markAllNotificationsAsRead}
                  className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                  title="Mark all notifications as read"
                >
                  <Check className="size-3" /> Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/60">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <Bell className="size-8 opacity-25 mb-2" />
                <p className="text-xs font-semibold text-foreground">No Notifications</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  High and critical safety events will appear here in real time.
                </p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={clsx(
                    'group flex items-start gap-3 p-3 transition cursor-pointer hover:bg-accent/60',
                    !notif.read ? 'bg-primary/5' : ''
                  )}
                >
                  {/* Unread indicator dot */}
                  <div className="mt-1.5 flex flex-col items-center">
                    <span
                      className={clsx(
                        'size-2 rounded-full',
                        !notif.read ? 'bg-primary animate-ping' : 'opacity-0'
                      )}
                    />
                    <span
                      className={clsx(
                        'size-2 rounded-full -mt-2',
                        !notif.read ? 'bg-primary' : 'bg-transparent'
                      )}
                    />
                  </div>

                  {/* Thumbnail if present */}
                  {notif.snapshot_url && (
                    <div className="size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-black">
                      <img
                        src={notif.snapshot_url}
                        alt="Incident"
                        className="size-full object-cover"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={clsx(
                        'text-xs font-bold truncate',
                        notif.severity === 'Critical' ? 'text-destructive' : 'text-foreground'
                      )}>
                        {notif.title}
                      </span>
                      <span className={clsx(
                        'shrink-0 rounded px-1.5 py-0.2 text-[9px] font-bold uppercase',
                        notif.severity === 'Critical' ? 'bg-destructive/20 text-destructive' :
                        notif.severity === 'High' ? 'bg-warning/20 text-warning' :
                        'bg-sky/20 text-sky'
                      )}>
                        {notif.severity}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {notif.message}
                    </p>

                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="truncate max-w-[140px] font-medium">{notif.zone}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-2.5" />
                        {new Date(notif.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border bg-card/60 p-2.5 px-3 text-xs">
            {notifications.length > 0 ? (
              <button
                onClick={clearNotifications}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition"
              >
                <Trash2 className="size-3" /> Clear list
              </button>
            ) : <div />}

            <button
              onClick={() => {
                setIsOpen(false)
                navigate('/settings')
              }}
              className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              <Settings className="size-3" /> Notification Settings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
