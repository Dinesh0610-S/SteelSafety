import React, { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  ShieldCheck, Sun, Moon, Menu, X, User,
  Users, LogIn, LogOut, ChevronDown, Shield, Sparkles,
  Settings as SettingsIcon, Smartphone, DownloadCloud
} from 'lucide-react'
import { NotificationBell } from './NotificationBell'
import { useApp } from '../context/AppContext'
import { clsx } from 'clsx'

const NAV_LINKS = [
  { to: '/',                  label: 'Home',              exact: true },
  { to: '/live',              label: 'Live Monitor',      exact: true },
  { to: '/incidents',         label: 'Incidents',         exact: false },
  { to: '/workers',           label: 'Workers',           exact: false },
  { to: '/analytics',         label: 'Analytics',         exact: false },
  { to: '/model-performance', label: 'Model Performance', exact: false },
  { to: '/settings',          label: 'Settings',          exact: false },
]

const ROLE_BADGES = {
  Admin: {
    bg: 'bg-primary/20 text-primary border-primary/40',
    dot: 'bg-primary',
  },
  Supervisor: {
    bg: 'bg-warning/20 text-warning border-warning/40',
    dot: 'bg-warning',
  },
  Viewer: {
    bg: 'bg-sky/20 text-sky border-sky/40',
    dot: 'bg-sky',
  },
}

export function Navbar() {
  const {
    dark,
    toggleDark,
    incidents,
    currentUser,
    logout,
    switchPersona,
    setAuthModalOpen,
    setAuthModalMode,
    setUserMgmtModalOpen,
  } = useApp()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  const openIncidentsCount = incidents?.filter(i => i.status === 'Open').length || 0

  // PWA Install Prompt Listener
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
    }
    setInstallPrompt(null)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="sticky top-0 z-40 px-4 pt-4">
      {/* Desktop nav pill */}
      <nav className="glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3">
        {/* Logo */}
        <NavLink
          to="/"
          className="flex items-center gap-2 font-display font-bold"
          onClick={() => setMobileOpen(false)}
        >
          <span
            className="bg-brand grid size-8 place-items-center rounded-lg shadow-glow text-white"
          >
            <ShieldCheck className="size-4" />
          </span>
          <span className="text-foreground">SteelSafe</span>
          <span className="text-brand">AI</span>
        </NavLink>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.exact}
              className={({ isActive }) =>
                clsx(
                  'relative rounded-lg px-3 py-1.5 text-sm transition',
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              <span>{link.label}</span>
              {link.to === '/incidents' && openIncidentsCount > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {openIncidentsCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2.5">
          {/* User Name & Role Pill / Dropdown */}
          {currentUser ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setProfileOpen(!profileOpen)}
                className="glass flex items-center gap-2 rounded-xl py-1 px-2.5 border border-border/80 hover:bg-accent/60 transition group"
              >
                {/* User Avatar Circle with Initials */}
                <div className="grid size-6 place-items-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                  {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'U'}
                </div>

                <div className="flex items-center gap-1.5 text-left">
                  <span className="text-xs font-bold text-foreground truncate max-w-[100px] sm:max-w-[130px]">
                    {currentUser.name}
                  </span>
                  {/* Role Badge */}
                  <span
                    className={clsx(
                      'rounded-md border px-1.5 py-0.2 text-[10px] font-black uppercase tracking-wider',
                      ROLE_BADGES[currentUser.role]?.bg || 'bg-muted text-muted-foreground border-border'
                    )}
                  >
                    {currentUser.role}
                  </span>
                </div>

                <ChevronDown className="size-3 text-muted-foreground group-hover:text-foreground transition" />
              </button>

              {/* Profile Dropdown Menu */}
              {profileOpen && (
                <div className="glass absolute right-0 mt-2 w-64 rounded-2xl border border-border p-3 shadow-2xl z-50 animate-in fade-in">
                  <div className="pb-2.5 border-b border-border">
                    <p className="text-xs font-bold text-foreground">{currentUser.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{currentUser.email}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={clsx('size-1.5 rounded-full', ROLE_BADGES[currentUser.role]?.dot)} />
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {currentUser.role === 'Admin' && 'Admin: Zones, Users & Settings'}
                        {currentUser.role === 'Supervisor' && 'Supervisor: Acknowledge & Resolve'}
                        {currentUser.role === 'Viewer' && 'Viewer: Dashboard Read-Only'}
                      </span>
                    </div>
                  </div>

                  {/* Switch Active Persona / Role for instant verification */}
                  <div className="py-2.5 border-b border-border">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Sparkles className="size-3 text-primary" /> Switch Role Persona
                    </p>
                    <div className="flex flex-col gap-1">
                      {['Admin', 'Supervisor', 'Viewer'].map(role => (
                        <button
                          key={role}
                          onClick={() => {
                            switchPersona(role)
                            setProfileOpen(false)
                          }}
                          className={clsx(
                            'flex items-center justify-between rounded-lg px-2 py-1 text-xs transition text-left',
                            currentUser.role === role
                              ? 'bg-accent text-accent-foreground font-bold'
                              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                          )}
                        >
                          <span>{role}</span>
                          {currentUser.role === role && (
                            <span className="text-[10px] text-primary font-bold">Active</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Admin Manage Users */}
                  {currentUser.role === 'Admin' && (
                    <button
                      onClick={() => {
                        setUserMgmtModalOpen(true)
                        setProfileOpen(false)
                      }}
                      className="mt-1.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition"
                    >
                      <Users className="size-3.5 text-primary" />
                      Manage Users & Roles
                    </button>
                  )}

                  {/* Notification Settings */}
                  <button
                    onClick={() => {
                      navigate('/settings')
                      setProfileOpen(false)
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition"
                  >
                    <SettingsIcon className="size-3.5 text-primary" />
                    Notification Settings
                  </button>

                  {/* Log Out */}
                  <button
                    onClick={() => {
                      logout()
                      setProfileOpen(false)
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 transition"
                  >
                    <LogOut className="size-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('login')
                  setAuthModalOpen(true)
                }}
                className="glass rounded-xl px-2.5 py-1 text-xs font-bold text-foreground hover:bg-accent transition"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('signup')
                  setAuthModalOpen(true)
                }}
                className="bg-brand rounded-xl px-2.5 py-1 text-xs font-bold text-white shadow-glow transition"
              >
                Sign Up
              </button>
            </div>
          )}

          {/* In-App Notification Bell */}
          <NotificationBell />

          {/* Desktop PWA Install Pill */}
          {installPrompt && (
            <button
              onClick={handleInstallClick}
              className="hidden lg:flex items-center gap-1.5 rounded-xl bg-primary/20 text-primary border border-primary/40 px-2.5 py-1 text-xs font-bold hover:bg-primary/30 transition shadow-sm"
              title="Install app to your home screen or desktop"
            >
              <Smartphone className="size-3.5" />
              <span>Install App</span>
            </button>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleDark}
            aria-label="Toggle theme"
            className="grid size-9 place-items-center rounded-lg border border-border bg-background/50 transition hover:bg-accent text-foreground"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Menu"
            className="grid size-9 place-items-center rounded-lg border border-border md:hidden text-foreground"
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="glass mx-auto mt-2 flex max-w-6xl flex-col rounded-2xl p-2 md:hidden">
          {NAV_LINKS.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.exact}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition',
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent'
                )
              }
            >
              <span>{link.label}</span>
              {link.to === '/incidents' && openIncidentsCount > 0 && (
                <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white">
                  {openIncidentsCount}
                </span>
              )}
            </NavLink>
          ))}

          {/* Mobile Install App Button */}
          {installPrompt && (
            <button
              onClick={() => {
                handleInstallClick()
                setMobileOpen(false)
              }}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-primary/20 text-primary border border-primary/40 px-3 py-2.5 text-xs font-bold hover:bg-primary/30 transition shadow-sm"
            >
              <DownloadCloud className="size-4" />
              <span>Install SteelSafe App (PWA)</span>
            </button>
          )}

          {currentUser && (
            <div className="mt-2 border-t border-border pt-2 px-3 pb-1 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-foreground">{currentUser.name}</p>
                <p className="text-[10px] text-muted-foreground">{currentUser.role} Role</p>
              </div>
              <button
                onClick={() => {
                  logout()
                  setMobileOpen(false)
                }}
                className="text-xs font-semibold text-destructive hover:underline"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
