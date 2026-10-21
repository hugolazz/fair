import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { Target } from '@/db/schemas/prepare'
import { cn } from '@/lib/cn'
import type { TargetsApi } from './use-targets'

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
