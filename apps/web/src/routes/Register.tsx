import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Navigate, useNavigate } from 'react-router'
import { registerSchema } from '@marble/core'
import type { RegisterInput } from '@marble/core'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../data'
import { AuthShell } from '../components/AuthShell'
import { Alert, Button, Field, Input, Spinner } from '../components/ui'

export function Register() {
  const { register: signUp, user, loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  })

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(values: RegisterInput) {
    setError(null)
    try {
      await signUp(values)
      navigate('/', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up access to your yard's inventory."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-stone-900 underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}

        <Field label="Name" error={errors.name?.message} htmlFor="name">
          <Input id="name" autoComplete="name" autoFocus {...register('name')} />
        </Field>

        <Field label="Email" error={errors.email?.message} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>

        <Field
          label="Password"
          error={errors.password?.message}
          htmlFor="password"
          hint="At least 8 characters."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
        </Field>

        <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          Create account
        </Button>
      </form>
    </AuthShell>
  )
}
