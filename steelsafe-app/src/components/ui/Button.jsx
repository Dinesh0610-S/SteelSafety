import React from 'react'
import { clsx } from 'clsx'

/**
 * Button – mirrors the original site's button component.
 * Variants: default | outline | ghost | destructive
 * Sizes: sm | md (default) | lg
 */
export function Button({
  children,
  className,
  variant = 'default',
  size = 'md',
  asChild = false,
  disabled,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer'

  const variants = {
    default:
      'bg-brand text-white hover:opacity-90 active:scale-[0.98]',
    outline:
      'border border-[var(--border)] bg-[var(--background)]/50 text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:scale-[0.98]',
    ghost:
      'bg-transparent text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
    destructive:
      'bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90',
  }

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-4 text-sm',
    lg: 'h-11 px-6 text-base',
  }

  const cls = clsx(base, variants[variant], sizes[size], className)

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      className: clsx(children.props.className, cls),
      ...props,
    })
  }

  return (
    <button className={cls} disabled={disabled} {...props}>
      {children}
    </button>
  )
}
