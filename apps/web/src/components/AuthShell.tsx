import type { ReactNode } from 'react'
import { Card } from './ui'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 flex justify-center">
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-stone-900" aria-hidden="true">
              <rect x="2" y="3" width="20" height="18" rx="3" fill="currentColor" opacity="0.12" />
              <rect
                x="2"
                y="3"
                width="20"
                height="18"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
              <path
                d="M4 15c3-1.5 4.5-6 7-6s3.5 4 5 4 2.5-1.5 4-2.5"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-stone-900">{title}</h1>
          <p className="mt-1 text-sm text-stone-600">{subtitle}</p>
        </div>

        <Card className="p-6">{children}</Card>

        <div className="mt-4 text-center text-sm text-stone-600">{footer}</div>

        <p className="mt-6 text-center text-xs text-stone-400">
          Demo build. Accounts and inventory are stored in this browser only — not on a server.
        </p>
      </div>
    </div>
  )
}
