import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { signUp } from '@/db/repositories/auth'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/field'
import { Wordmark } from '@/components/wordmark'

const emailSchema = z.email()
const MIN_PASSWORD = 8

type Errors = Partial<Record<'firstName' | 'email' | 'password' | 'form', string>>

export default function SignupPage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [confirmation, setConfirmation] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = emailSchema.safeParse(email.trim().toLowerCase())
    const next: Errors = {}
    if (!firstName.trim()) next.firstName = t('signup.firstNameRequired')
    if (!parsed.success) next.email = t('login.invalidEmail')
    if (password.length < MIN_PASSWORD)
      next.password = t('signup.passwordTooShort', { min: MIN_PASSWORD })
    setErrors(next)
    if (Object.keys(next).length > 0 || !parsed.success) return
    setSaving(true)
    try {
      // En cas de succès avec session ouverte, l'app redirige toute seule vers le choix de l'équipe.
      const { confirmationNeeded } = await signUp(
        parsed.data,
        password,
        `${firstName.trim()} ${lastName.trim()}`.trim(),
      )
      if (confirmationNeeded) setConfirmation(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setErrors({
        form: /already registered|already been registered/i.test(message)
          ? t('signup.alreadyRegistered')
          : message || tc('states.error'),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="animate-rise mx-auto flex min-h-dvh w-full max-w-[380px] flex-col justify-center gap-10 px-6 py-10">
      <Wordmark className="text-[4rem]" />

      {confirmation ? (
        <div role="status" className="flex flex-col gap-4">
          <h1 className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
            {t('signup.confirmTitle')}
          </h1>
          <p className="text-[15px] leading-normal text-slate-600">
            {t('signup.confirmBody', { email: email.trim().toLowerCase() })}
          </p>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/login">{t('signup.backToLogin')}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <div>
            <h1 className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
              {t('signup.title')}
            </h1>
            <p className="mt-2 text-[15px] leading-normal text-slate-600">{t('signup.subtitle')}</p>
          </div>
          <InputField
            label={t('signup.firstName')}
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={errors.firstName}
            required
            autoFocus
          />
          <InputField
            label={t('signup.lastName')}
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <InputField
            label={t('login.email')}
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder={t('login.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            required
          />
          <InputField
            label={t('login.password')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password ?? errors.form}
            required
          />
          <Button type="submit" disabled={saving} className="mt-3 min-h-[50px] w-full text-[15px]">
            {saving ? t('signup.saving') : t('signup.submit')}
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to="/login">{t('signup.haveAccount')}</Link>
          </Button>
        </form>
      )}
    </main>
  )
}
