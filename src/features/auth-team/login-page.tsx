import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { signInWithPassword } from '@/db/repositories/auth'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/field'
import { Wordmark } from '@/components/wordmark'

const emailSchema = z.email()

export default function LoginPage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string>()
  const [error, setError] = useState<string>()
  const [signingIn, setSigningIn] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = emailSchema.safeParse(email.trim().toLowerCase())
    setEmailError(parsed.success ? undefined : t('login.invalidEmail'))
    setError(undefined)
    if (!parsed.success) return
    if (!password) {
      setError(t('login.passwordRequired'))
      return
    }
    setSigningIn(true)
    try {
      // En cas de succès, la session change et l'app redirige toute seule.
      await signInWithPassword(parsed.data, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(
        /invalid login credentials/i.test(message)
          ? t('login.invalidCredentials')
          : message || tc('states.error'),
      )
      setSigningIn(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div>
        <Wordmark className="text-4xl" />
        <p className="mt-2 text-slate-600">{tc('tagline')}</p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">{t('login.title')}</h1>
        <InputField
          label={t('login.email')}
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder={t('login.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          required
        />
        <InputField
          label={t('login.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          required
        />
        <Button type="submit" disabled={signingIn}>
          {signingIn ? t('login.signingIn') : t('login.submit')}
        </Button>
      </form>
    </main>
  )
}
