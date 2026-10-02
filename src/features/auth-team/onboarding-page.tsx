import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { signOut } from '@/db/repositories/auth'
import { createTeam } from '@/db/repositories/teams'
import { useSession } from './session'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/field'
import { Wordmark } from '@/components/wordmark'

export default function OnboardingPage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const { refreshMembership } = useSession()
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('onboarding.required'))
      return
    }
    setError(undefined)
    setSaving(true)
    try {
      await createTeam(name.trim())
      await refreshMembership()
    } catch (err) {
      setError(err instanceof Error ? err.message : tc('states.error'))
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-10">
      <Wordmark className="text-4xl" />
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold">{t('onboarding.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('onboarding.subtitle')}</p>
        </div>
        <InputField
          label={t('onboarding.teamName')}
          placeholder={t('onboarding.teamNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          autoFocus
        />
        <Button type="submit" disabled={saving}>
          {t('onboarding.submit')}
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          {t('signOut')}
        </Button>
      </form>
    </main>
  )
}
