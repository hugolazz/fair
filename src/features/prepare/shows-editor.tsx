import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { Tag, Target } from '@/db/schemas/prepare'
import { cn } from '@/lib/cn'
import { showAbbrev } from './lib/shows'
import type { TargetsApi } from './use-targets'

/** L'abréviation d'un salon : vide = automatique. S'enregistre en quittant le champ ou avec Entrée. */
function AbbrevRow({ show, api }: { show: Tag; api: TargetsApi }) {
  const { t } = useTranslation('prepare')
  const [value, setValue] = useState(show.abbrev ?? '')
  const auto = showAbbrev(show.label)

  function commit() {
    const clean = value.trim()
    if (clean === (show.abbrev ?? '')) return
    void api.actions.setShowAbbrev(show.id, clean === '' ? null : clean)
  }

  return (
    <li className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-sm">{show.label}</span>
      <input
        aria-label={t('shows.abbrevFor', { label: show.label })}
        placeholder={auto}
        value={value}
        maxLength={8}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
        className="min-h-11 w-28 shrink-0 rounded-lg border border-slate-300 px-3 text-center md:min-h-9"
      />
    </li>
  )
}

/**
 * Salons de l'entreprise (« Modifier la fiche ») : on coche ceux où elle était ou sera. Un admin peut aussi ajouter un
 * salon qui n'existe pas encore (création de tag réservée aux admins) ; sa couleur est automatique.
 */
export function ShowsEditor({
  target,
  api,
  admin,
}: {
  target: Target
  api: TargetsApi
  admin: boolean
}) {
  const { t } = useTranslation('prepare')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string>()

  async function add() {
    const clean = label.trim()
    if (!clean) return
    const existing = api.shows.find((s) => s.label.toLowerCase() === clean.toLowerCase())
    if (existing) {
      if (target.tagIds.includes(existing.id)) {
        setError(t('shows.duplicate'))
        return
      }
      void api.actions.toggleTag([target.id], existing.id, true)
      setLabel('')
      setError(undefined)
      return
    }
    const tag = await api.actions.createShow(clean)
    if (!tag) {
      setError(t('shows.error'))
      return
    }
    void api.actions.toggleTag([target.id], tag.id, true)
    setLabel('')
    setError(undefined)
  }

  return (
    <div className="flex flex-col gap-3">
      {api.shows.length === 0 ? (
        <p className="text-sm text-slate-600">{t('shows.none')}</p>
      ) : (
        <div role="group" aria-label={t('shows.edit')} className="flex flex-wrap gap-2">
          {api.shows.map((show) => {
            const on = target.tagIds.includes(show.id)
            return (
              <button
                key={show.id}
                type="button"
                aria-pressed={on}
                onClick={() => void api.actions.toggleTag([target.id], show.id, !on)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium md:min-h-9',
                  on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white',
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: show.color }}
                />
                {show.label}
              </button>
            )
          })}
        </div>
      )}
      {admin && api.shows.length > 0 ? (
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="min-h-9 cursor-pointer text-sm font-medium">
            {t('shows.abbrevTitle')}
          </summary>
          <p className="mt-2 mb-3 text-xs text-slate-600">{t('shows.abbrevHelp')}</p>
          <ul className="flex flex-col gap-2">
            {api.shows.map((show) => (
              <AbbrevRow key={`${show.id}:${show.abbrev ?? ''}`} show={show} api={api} />
            ))}
          </ul>
        </details>
      ) : null}
      {admin ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <div className="flex items-center gap-2">
            <input
              aria-label={t('shows.new')}
              placeholder={t('shows.newPlaceholder')}
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3"
            />
            <Button type="submit" variant="secondary">
              {t('shows.add')}
            </Button>
          </div>
          <p className="text-xs text-slate-600">{t('shows.hint')}</p>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  )
}
