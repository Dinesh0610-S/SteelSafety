import React from 'react'
import { clsx } from 'clsx'

/**
 * Card – glass morphism card component matching the original design.
 */
export function Card({ className, children, ...props }) {
  return (
    <div
      className={clsx('glass rounded-2xl', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={clsx('p-6 pb-0', className)} {...props}>
      {children}
    </div>
  )
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={clsx('p-6', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3
      className={clsx('font-display text-lg font-bold leading-tight', className)}
      {...props}
    >
      {children}
    </h3>
  )
}
