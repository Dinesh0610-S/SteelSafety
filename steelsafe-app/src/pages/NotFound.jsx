import React from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, ArrowRight } from 'lucide-react'
import { Button } from '../components/ui/Button'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <ShieldCheck className="size-16 opacity-20 mb-6" style={{ color: 'var(--primary)' }} />
      <h1 className="font-display text-5xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
        404
      </h1>
      <p className="text-lg mb-2" style={{ color: 'var(--foreground)' }}>Page not found</p>
      <p className="mb-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>
        This page doesn't exist. Head back to the dashboard.
      </p>
      <Button size="lg" asChild>
        <Link to="/">
          Go home <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  )
}
