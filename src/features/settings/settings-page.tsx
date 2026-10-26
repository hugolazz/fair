import { useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/page-states'
import { cn } from '@/lib/cn'
import { AccountTab } from './account-tab'
import { TeamTab } from './team-tab'

const TABS = ['account', 'team'] as const
type Tab = (typeof TABS)[number]
/** Valeurs de `?section=` (l'adresse reste lisible et partageable). */
const SECTION: Record<Tab, string> = { account: 'compte', team: 'equipe' }

/** Réglages, rangés en deux onglets : ce qui concerne la personne, et ce qui concerne l'équipe. */
export default function SettingsPage() {
  const { t } = useTranslation('settings')
  const [params, setParams] = useSearchParams()
  const current: Tab = params.get('section') === SECTION.team ? 'team' : 'account'
  const buttons = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})

  const select = (tab: Tab) =>
    setParams(tab === 'account' ? {} : { section: SECTION[tab] }, { replace: true })
  // Flèches gauche / droite, Début / Fin : navigation au clavier d'une liste d'onglets.
  const onKeyDown = (e: KeyboardEvent) => {
    const at = TABS.indexOf(current)
    const next =
      e.key === 'ArrowRight'
        ? TABS[(at + 1) % TABS.length]
        : e.key === 'ArrowLeft'
          ? TABS[(at + TABS.length - 1) % TABS.length]
          : e.key === 'Home'
            ? TABS[0]
            : e.key === 'End'
              ? TABS[TABS.length - 1]
              : undefined
    if (!next) return
    e.preventDefault()
    select(next)
    buttons.current[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink to="/events">{t('backHome')}</BackLink>
      </div>
      <PageHeader title={t('title')} />

      <div
        role="tablist"
        aria-label={t('tabs.label')}
        onKeyDown={onKeyDown}
        className="flex gap-1 border-b border-slate-200"
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            ref={(el) => {
              buttons.current[tab] = el
            }}
            type="button"
            role="tab"
            id={`settings-tab-${tab}`}
            aria-selected={current === tab}
            aria-controls="settings-panel"
            tabIndex={current === tab ? 0 : -1}
            onClick={() => select(tab)}
            className={cn(
              '-mb-px min-h-11 border-b-2 px-4 text-base font-medium transition-colors duration-200',
              current === tab
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${current}`}>
        {current === 'account' ? <AccountTab /> : <TeamTab />}
      </div>
    </div>
  )
}
