import { Navigate, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Loading } from './ui'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Wait for the initial session check, otherwise a refresh on a deep link flashes the
  // login screen before restoring the session.
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4">
        <Loading label="Checking your session…" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}
