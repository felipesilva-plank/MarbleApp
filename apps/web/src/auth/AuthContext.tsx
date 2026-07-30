import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { LoginInput, RegisterInput, User } from '@marble/core'
import { useQueryClient } from '@tanstack/react-query'
import { auth } from '../data'

interface AuthValue {
  user: User | null
  /** True only during the initial session check, so routes don't flash the login screen. */
  loading: boolean
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true
    auth
      .currentUser()
      .then((found) => {
        if (active) setUser(found)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (input: LoginInput) => {
    setUser(await auth.login(input))
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    setUser(await auth.register(input))
  }, [])

  const logout = useCallback(async () => {
    await auth.logout()
    setUser(null)
    // Drop cached inventory so nothing from the previous session lingers on screen.
    queryClient.clear()
  }, [queryClient])

  const value = useMemo<AuthValue>(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
