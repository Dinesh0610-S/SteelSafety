import React from 'react'
import { ShieldAlert, Lock, LogIn, UserCheck, ShieldCheck } from 'lucide-react'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { useApp } from '../context/AppContext'

export function AccessGate({ pageName = 'This Portal' }) {
  const { setAuthModalOpen, setAuthModalMode, switchPersona } = useApp()

  return (
    <div className="flex min-h-[500px] flex-col items-center justify-center p-6">
      <Card className="glass w-full max-w-lg p-8 text-center border-border shadow-2xl relative overflow-hidden">
        {/* Glow corner accent */}
        <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-primary/20 blur-2xl" />

        <div className="bg-brand mx-auto mb-4 grid size-16 place-items-center rounded-2xl shadow-glow text-white">
          <Lock className="size-8" />
        </div>

        <h2 className="font-display text-2xl font-bold text-foreground">
          Authentication Required
        </h2>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          Access to <strong>{pageName}</strong> is protected under <strong>SteelSafe Row-Level Security (RLS)</strong>.
          Please sign in with your email account or select a plant operator role to continue.
        </p>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button
            onClick={() => {
              setAuthModalMode('login')
              setAuthModalOpen(true)
            }}
            className="shadow-glow gap-2 text-xs font-bold"
          >
            <LogIn className="size-3.5" /> Sign In with Email
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setAuthModalMode('signup')
              setAuthModalOpen(true)
            }}
            className="gap-2 text-xs font-bold"
          >
            <UserCheck className="size-3.5" /> Create New Account
          </Button>
        </div>

        {/* Instant Demo Access Buttons */}
        <div className="mt-8 border-t border-border pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Instant Demo Operator Logins
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => switchPersona('Admin')}
              className="glass rounded-xl p-2.5 text-center border-primary/30 hover:border-primary transition"
            >
              <span className="block text-[10px] font-bold text-primary">Admin</span>
              <span className="block text-xs font-bold text-foreground">Alex Vance</span>
              <span className="block text-[9px] text-muted-foreground">Manage Zones & Users</span>
            </button>
            <button
              onClick={() => switchPersona('Supervisor')}
              className="glass rounded-xl p-2.5 text-center border-warning/30 hover:border-warning transition"
            >
              <span className="block text-[10px] font-bold text-warning">Supervisor</span>
              <span className="block text-xs font-bold text-foreground">Marcus Vance</span>
              <span className="block text-[9px] text-muted-foreground">Resolve Incidents</span>
            </button>
            <button
              onClick={() => switchPersona('Viewer')}
              className="glass rounded-xl p-2.5 text-center border-sky/30 hover:border-sky transition"
            >
              <span className="block text-[10px] font-bold text-sky">Viewer</span>
              <span className="block text-xs font-bold text-foreground">Elena Rostova</span>
              <span className="block text-[9px] text-muted-foreground">Read-Only</span>
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
