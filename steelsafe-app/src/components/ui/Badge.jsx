import React from 'react'
import { clsx } from 'clsx'

/**
 * Badge – small pill badge matching the original design system.
 * Variants: default | primary | success | warning | critical | destructive | outline
 */
export function Badge({ children, variant = 'default', className, ...props }) {
  const variants = {
    default:  'bg-[var(--muted)] text-[var(--muted-foreground)]',
    primary:  'bg-brand text-white',
    success:  'severity-low',
    warning:  'severity-high',
    high:     'severity-high',
    critical: 'severity-critical',
    medium:   'severity-medium',
    low:      'severity-low',
    outline:  'border border-[var(--border)] text-[var(--muted-foreground)]',
    live:     'bg-[var(--destructive)] text-white',
    offline:  'bg-[var(--muted)] text-[var(--muted-foreground)]',
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        variants[variant] ?? variants.default,
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
