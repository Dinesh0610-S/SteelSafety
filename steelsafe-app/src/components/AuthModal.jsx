import React, { useState } from 'react'
import {
  ShieldCheck, Lock, Mail, User, ShieldAlert,
  CheckCircle2, X, Sparkles, ArrowRight, Key
} from 'lucide-react'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { useApp } from '../context/AppContext'
import { clsx } from 'clsx'

export function AuthModal() {
  const {
    authModalOpen,
    setAuthModalOpen,
    authModalMode,
    setAuthModalMode,
    login,
    signup,
    switchPersona,
  } = useApp()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('Viewer')
  const [department, setDepartment] = useState('Safety & Compliance')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  if (!authModalOpen) return null

  const isLogin = authModalMode === 'login'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg(null)
    setLoading(true)

    try {
      if (isLogin) {
        await login(email, password)
      } else {
        await signup({ email, password, name, role, department })
      }
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleQuickPersona = (roleName) => {
    switchPersona(roleName)
    setAuthModalOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in">
      <div className="glass w-full max-w-md rounded-2xl border border-border p-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={() => setAuthModalOpen(false)}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          <X className="size-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-brand grid size-10 place-items-center rounded-xl shadow-glow text-white">
            <Lock className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">
              {isLogin ? 'Sign In to SteelSafe' : 'Create SteelSafe Account'}
            </h2>
            <p className="text-xs text-muted-foreground">
              Industrial Plant Intelligence & Row-Level Security
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-background/60 p-1 mb-5">
          <button
            type="button"
            onClick={() => {
              setAuthModalMode('login')
              setErrorMsg(null)
            }}
            className={clsx(
              'rounded-lg py-1.5 text-xs font-semibold transition',
              isLogin
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthModalMode('signup')
              setErrorMsg(null)
            }}
            className={clsx(
              'rounded-lg py-1.5 text-xs font-semibold transition',
              !isLogin
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Create Account
          </button>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/15 px-3 py-2 text-xs text-destructive">
            <ShieldAlert className="size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {!isLogin && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Full Name</label>
              <div className="relative mt-1">
                <User className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Alex Vance"
                  className="glass w-full rounded-xl py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Work Email</label>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="operator@steelsafe.ai"
                className="glass w-full rounded-xl py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Password</label>
            <div className="relative mt-1">
              <Key className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="glass w-full rounded-xl py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {!isLogin && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Assigned Role (Stored in <code className="text-primary font-mono">user_roles</code> table)
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="glass mt-1 w-full rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="Viewer">Viewer (Dashboard Read-Only)</option>
                <option value="Supervisor">Supervisor (Acknowledge & Resolve Incidents)</option>
                <option value="Admin">Admin (Full Control: Zones, Users & Settings)</option>
              </select>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="mt-2 w-full shadow-glow font-bold gap-2"
          >
            {loading ? 'Authenticating...' : isLogin ? 'Sign In to Portal' : 'Create Account'}
            <ArrowRight className="size-4" />
          </Button>
        </form>

        {/* Fast Persona Switcher for Live Demo / Testing */}
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="size-3 text-primary" /> Fast Demo Personas
            </span>
            <span className="text-[10px] text-muted-foreground">1-Click Sign In</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickPersona('Admin')}
              className="glass flex flex-col items-center gap-1 rounded-xl p-2 text-center border-primary/30 hover:border-primary hover:bg-primary/10 transition"
            >
              <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                Admin
              </span>
              <span className="text-[11px] font-semibold text-foreground truncate max-w-full">
                Alex Vance
              </span>
              <span className="text-[9px] text-muted-foreground">Zones & Users</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickPersona('Supervisor')}
              className="glass flex flex-col items-center gap-1 rounded-xl p-2 text-center border-warning/30 hover:border-warning hover:bg-warning/10 transition"
            >
              <span className="rounded bg-warning/20 px-1.5 py-0.2 text-[10px] font-bold text-warning">
                Supervisor
              </span>
              <span className="text-[11px] font-semibold text-foreground truncate max-w-full">
                Marcus Vance
              </span>
              <span className="text-[9px] text-muted-foreground">Incidents Flow</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickPersona('Viewer')}
              className="glass flex flex-col items-center gap-1 rounded-xl p-2 text-center border-sky/30 hover:border-sky hover:bg-sky/10 transition"
            >
              <span className="rounded bg-sky/20 px-1.5 py-0.2 text-[10px] font-bold text-sky">
                Viewer
              </span>
              <span className="text-[11px] font-semibold text-foreground truncate max-w-full">
                Elena Rostova
              </span>
              <span className="text-[9px] text-muted-foreground">Read-Only</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
