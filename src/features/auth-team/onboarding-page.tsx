import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { signOut } from '@/db/repositories/auth'
import { createTeam, joinTeam, searchTeams, type TeamHit } from '@/db/repositories/teams'
import { useSession } from './session'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/field'
import { Wordmark } from '@/components/wordmark'
import { firstNameOf } from '@/lib/person'

const MIN_QUERY = 2

/** Étape après la création du compte : rejoindre une équipe existante, en créer une, ou travailler seul. */
export default function OnboardingPage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const s = useSession()
  const { refreshMembership } = s
  const displayName = s.status === 'needsTeam' ? s.displayName : ''
  const email = s.status === 'needsTeam' ? (s.session.user.email ?? '') : ''
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<TeamHit[]>()
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const trimmed = query.trim()
  useEffect(() => {
    if (creating || trimmed.length < MIN_QUERY) return
    let cancelled = false
    const timer = setTimeout(() => {
      searchTeams(trimmed)
        .then((found) => !cancelled && setHits(found))
        .catch(() => !cancelled && setError(tc('states.error')))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [trimmed, creating, tc])
  const shownHits = trimmed.length >= MIN_QUERY ? hits : undefined

  async function run(action: () => Promise<void>) {
    setError(undefined)
    setBusy(true)
    try {
      await action()
      await refreshMembership()
    } catch (err) {
      setError(err instanceof Error ? err.message : tc('states.error'))
      setBusy(false)
    }
  }

  function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('onboarding.required'))
      return
    }
    void run(() => createTeam(name.trim()))
  }

  // « Sans équipe » : les données sont toujours rattachées à une équipe, ici une équipe à une seule personne.
  const who = displayName || firstNameOf(email) || email
  const solo = () => run(() => createTeam(t('onboarding.soloName', { name: who })))

  return (
    <main className="animate-rise mx-auto flex min-h-dvh w-full max-w-[380px] flex-col justify-center gap-8 px-6 py-10">
      <Wordmark className="text-[4rem]" />

      {creating ? (
        <form onSubmit={onCreate} noValidate className="flex flex-col gap-5">
          <div>
            <h1 className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
              {t('onboarding.createTitle')}
            </h1>
            <p className="mt-2 text-[15px] leading-normal text-slate-600">
              {t('onboarding.createSubtitle')}
            </p>
          </div>
          <InputField
            label={t('onboarding.teamName')}
            placeholder={t('onboarding.teamNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error}
            autoFocus
          />
          <Button type="submit" disabled={busy} className="mt-3 min-h-[50px] w-full text-[15px]">
            {t('onboarding.submit')}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setCreating(false)
              setError(undefined)
            }}
          >
            {t('onboarding.backToSearch')}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
              {t('onboarding.title')}
            </h1>
            <p className="mt-2 text-[15px] leading-normal text-slate-600">
              {t('onboarding.subtitle')}
            </p>
          </div>
          <InputField
            label={t('onboarding.searchLabel')}
            placeholder={t('onboarding.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            error={error}
            autoFocus
          />
          {shownHits ? (
            shownHits.length > 0 ? (
              <ul className="flex flex-col gap-2" aria-label={t('onboarding.results')}>
                {shownHits.map((hit) => (
                  <li
                    key={hit.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3 pl-4 shadow-[0_0_0_1px_var(--color-slate-200)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{hit.name}</span>
                      <span className="text-sm text-slate-600">
                        {t('onboarding.members', { count: hit.memberCount })}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      aria-label={t('onboarding.joinNamed', { name: hit.name })}
                      onClick={() => void run(() => joinTeam(hit.id))}
                    >
                      {t('onboarding.join')}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className="text-sm text-slate-600">
                {t('onboarding.noResult')}
              </p>
            )
          ) : null}

          <div className="mt-2 flex flex-col gap-3">
            <Button
              variant="ink"
              className="min-h-[50px] w-full text-[15px]"
              onClick={() => {
                setCreating(true)
                setError(undefined)
                if (!name && trimmed) setName(trimmed)
              }}
            >
              {t('onboarding.create')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              className="min-h-[50px] w-full text-[15px]"
              onClick={() => void solo()}
            >
              {t('onboarding.solo')}
            </Button>
            <p className="text-center text-sm text-slate-600">{t('onboarding.soloHint')}</p>
          </div>
        </div>
      )}

      <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
        {t('signOut')}
      </Button>
    </main>
  )
}
