import type { ComponentPropsWithRef, ReactNode } from 'react'

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// --- Button ------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-stone-900 text-white hover:bg-stone-800 disabled:hover:bg-stone-900',
  secondary:
    'bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 disabled:hover:bg-white',
  ghost: 'bg-transparent text-stone-600 hover:bg-stone-200/70 disabled:hover:bg-transparent',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:hover:bg-red-600',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
}

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-medium shadow-sm transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  )
}

// --- Surfaces ----------------------------------------------------------------

export function Card({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return (
    <div
      className={cx('rounded-xl border border-stone-200 bg-white shadow-sm', className)}
      {...props}
    />
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">{children}</h2>
      {action}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-stone-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

// --- Feedback ----------------------------------------------------------------

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-12 text-sm text-stone-500">
      <Spinner />
      {label}
    </div>
  )
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info' | 'warning'
  children: ReactNode
}) {
  const tones = {
    error: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-sky-50 text-sky-900 border-sky-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
  }
  return (
    <div className={cx('rounded-lg border px-3 py-2 text-sm', tones[tone])} role="alert">
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
      <p className="text-sm font-medium text-stone-800">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-stone-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

// --- Form controls -----------------------------------------------------------

export function Field({
  label,
  error,
  hint,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode
  error?: string
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? <p className="field-error">{error}</p> : null}
      {!error && hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  )
}

export function Input({ className, ...props }: ComponentPropsWithRef<'input'>) {
  return <input className={cx('field-input', className)} {...props} />
}

export function Select({ className, ...props }: ComponentPropsWithRef<'select'>) {
  return <select className={cx('field-input', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea className={cx('field-input', className)} {...props} />
}

// --- Modal -------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-stone-900/40"
        onClick={onClose}
      />
      <Card className="relative z-10 w-full max-w-lg p-5">
        <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
        <div className="mt-3 text-sm text-stone-700">{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </Card>
    </div>
  )
}

export { cx }
