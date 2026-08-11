import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { loginSchema } from '@marble/core'
import type { LoginInput } from '@marble/core'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../data'
import { AuthShell } from '../components/AuthShell'
import { Alert, Button, Field, Input, Spinner } from '../components/ui'

export function Login() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (!loading && user) return <Navigate to="/" replace />

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  async function onSubmit(values: LoginInput) {
    setError(null)
    try {
      await login(values)
      navigate(from, { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <AuthShell
      title="Sign in to MarbleApp"
      subtitle="Track every piece back to the stone it came from."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="font-medium text-stone-900 underline underline-offset-2">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}

        <Field label="Email" error={errors.email?.message} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" autoFocus {...register('email')} />
        </Field>

        <Field label="Password" error={errors.password?.message} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
        </Field>

        <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}
