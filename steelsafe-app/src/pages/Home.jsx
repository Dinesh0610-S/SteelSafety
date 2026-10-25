import React from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, Brain, Flame, ChartLine, HardHat, ArrowRight
} from 'lucide-react'
import { Button } from '../components/ui/Button'

const FEATURES = [
  {
    icon: <Sparkles className="size-5" />,
    title: 'Vision detection',
    text: 'Spot PPE violations, smoke and intrusions from live camera feeds in real-time.',
  },
  {
    icon: <Brain className="size-5" />,
    title: 'AI structuring',
    text: 'Turn camera streams and sensor data into clean, categorized safety records.',
  },
  {
    icon: <Flame className="size-5" />,
    title: 'Hazard scoring',
    text: 'Severity and confidence on every detection, ready to triage instantly.',
  },
  {
    icon: <ChartLine className="size-5" />,
    title: 'Live analytics',
    text: 'Trends, zone heatmaps and AI-written insight summaries updated live.',
  },
]

const STATS = [
  ['0.91 F1', 'Empirically Measured'],
  ['< 200ms', 'Local Inference'],
  ['6',       'Hazard Classes'],
  ['24/7',    'Continuous Edge'],
]

export default function Home() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative pt-12 text-center md:pt-20">
        {/* Pill badge */}
        <div
          className="glass mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <Sparkles className="size-3.5" style={{ color: 'var(--primary)' }} />
          Hackathon 2026 · Industrial AI
        </div>

        {/* Headline */}
        <h1
          className="mx-auto mt-0 max-w-4xl text-4xl font-extrabold leading-tight md:text-7xl font-display"
          style={{ color: 'var(--foreground)' }}
        >
          STEELSAFE{' '}
          <span className="text-brand">INTELLIGENCE</span>
        </h1>

        {/* Sub */}
        <p
          className="mx-auto mt-5 max-w-2xl text-lg"
          style={{ color: 'var(--muted-foreground)' }}
        >
          AI-powered industrial safety monitoring platform for steel plants.
          Stream your plant camera — get live structured, scored safety incidents.
        </p>

        {/* CTA buttons */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" className="shadow-glow" asChild>
            <Link to="/live">
              Start live monitoring <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/analytics">View dashboard</Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="gap-1.5 border-primary/40 hover:bg-primary/10">
            <Link to="/model-performance">Model Performance</Link>
          </Button>
        </div>

        {/* Stats grid */}
        <div className="relative mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
          {STATS.map(([value, label], i) => (
            <div
              key={label}
              className="glass rounded-2xl p-5"
              style={{
                animation: `float 4s ease-in-out ${i * 0.5}s infinite`,
              }}
            >
              <div
                className="font-display text-3xl font-bold text-brand"
              >
                {value}
              </div>
              <div
                className="mt-1 text-xs"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature cards ── */}
      <section className="mt-24 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon, title, text }, i) => (
          <div
            key={title}
            className="glass rounded-2xl p-6 transition-transform duration-200 hover:-translate-y-1"
          >
            <div
              className="bg-brand grid size-10 place-items-center rounded-xl text-white"
            >
              {icon}
            </div>
            <h3 className="mt-4 font-semibold" style={{ color: 'var(--foreground)' }}>
              {title}
            </h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {text}
            </p>
          </div>
        ))}
      </section>

      {/* ── CTA banner ── */}
      <section className="glass mt-16 flex flex-col items-center gap-4 rounded-3xl p-10 text-center md:flex-row md:text-left">
        <HardHat className="size-12" style={{ color: 'var(--primary)' }} />
        <div className="flex-1">
          <h2 className="text-2xl font-bold font-display" style={{ color: 'var(--foreground)' }}>
            Zero-harm starts with visibility.
          </h2>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Every incident captured, categorized and actionable — in real time.
          </p>
        </div>
        <Button size="lg" asChild>
          <Link to="/live">Start monitoring</Link>
        </Button>
      </section>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}
