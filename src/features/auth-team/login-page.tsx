import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
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
    <main className="animate-rise mx-auto flex min-h-dvh w-full max-w-[380px] flex-col justify-center gap-10 px-6 py-10">
      <div>
        <Wordmark className="text-[4rem]" />
        <p className="mt-3.5 text-[17px] leading-normal text-balance text-slate-600">
          {tc('tagline')}
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <h1 className="sr-only">{t('login.title')}</h1>
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
        <Button type="submit" disabled={signingIn} className="mt-3 min-h-[50px] w-full text-[15px]">
          {signingIn ? t('login.signingIn') : t('login.submit')}
        </Button>
        <Button asChild variant="secondary" className="min-h-[50px] w-full text-[15px]">
          <Link to="/signup">{t('login.createAccount')}</Link>
        </Button>
      </form>
    </main>
  )
}
