import { Move, Trash2, Unlink } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { PlanPin } from '@/db/schemas/plan'
import { updatePin } from '@/db/repositories/plans'
import type { Target } from '@/db/schemas/prepare'
import type { PinView } from './lib/pins'
import { TargetList } from './target-list'

type ChooserProps = {
  rows: Target[]
  placed: Set<string>
  /** Le pin à créer : relié à une entreprise (avec le numéro saisi, s'il y en a un) ou « stand seul ». */
  onCreate: (input: { targetId: string | null; standLabel: string | null }) => void
  onCancel: () => void
}

/**
 * Nouveau pin (après un clic sur le plan) : on choisit l'entreprise dans la liste, ou on saisit juste un numéro de
 * stand. Taper un numéro remonte en tête les entreprises dont le stand correspond.
 */
export function PinChooser({ rows, placed, onCreate, onCancel }: ChooserProps) {
  const { t } = useTranslation('plan')
  const [stand, setStand] = useState('')
  const standId = useId()
  const standOnly = () => {
    if (stand.trim()) onCreate({ targetId: null, standLabel: stand })
  }
  return (
    <section aria-label={t('edit.newPin')} className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 className="text-base font-semibold">{t('edit.newPin')}</h2>
      <p className="text-sm text-slate-700">{t('edit.newPinHelp')}</p>
      <div className="flex flex-col gap-1">
        <label htmlFor={standId} className="text-sm font-medium">
          {t('edit.standLabel')}
        </label>
        <input
          id={standId}
          value={stand}
          onChange={(e) => setStand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              standOnly()
            }
          }}
          autoComplete="off"
          placeholder={t('edit.standPlaceholder')}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
      </div>
      <TargetList
        autoFocus
        className="flex-1"
        rows={rows}
        placed={placed}
        standLabel={stand}
        pickLabel={(r) => t('edit.linkTo', { name: r.name })}
        onPick={(r) => onCreate({ targetId: r.id, standLabel: stand.trim() || null })}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!stand.trim()} onClick={standOnly}>
          {t('edit.standOnly')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('edit.cancel')}
        </Button>
      </div>
    </section>
  )
}

type DetailsProps = {
  pin: PinView
  raw: PlanPin
  rows: Target[]
  placed: Set<string>
  onMove: () => void
  onRemove: () => void
  onClose: () => void
  /** Appelé après une modification enregistrée (rechargement des pins). */
  onChanged: () => void
}

/** Pin sélectionné : numéro de stand, entreprise reliée (relier / délier), déplacer, supprimer. */
export function PinDetails({
  pin,
  raw,
  rows,
  placed,
  onMove,
  onRemove,
  onClose,
  onChanged,
}: DetailsProps) {
  const { t } = useTranslation('plan')
  const standId = useId()
  const [stand, setStand] = useState(raw.standLabel ?? '')
  const [relinking, setRelinking] = useState(false)
  const [error, setError] = useState(false)

  const guard = (run: Promise<void>) => {
    setError(false)
    run.then(onChanged, () => setError(true))
  }
  const saveStand = () => {
    if (stand.trim() === (raw.standLabel ?? '')) return
    if (!stand.trim() && !pin.targetId) {
      setStand(raw.standLabel ?? '') // un pin garde au moins un numéro ou une entreprise
      return
    }
    guard(updatePin(raw, { standLabel: stand }))
  }
  const canUnlink = !!(raw.standLabel || pin.stand)

  return (
    <section aria-label={t('edit.pinDetails')} className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h2 className="truncate text-base font-semibold">{pin.name}</h2>
        <p className="text-sm text-slate-700">
          {pin.targetId ? t('edit.linkedTo', { name: pin.name }) : t('edit.notLinked')}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={standId} className="text-sm font-medium">
          {t('edit.standLabel')}
        </label>
        <input
          id={standId}
          value={stand}
          onChange={(e) => setStand(e.target.value)}
          onBlur={saveStand}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            e.currentTarget.blur()
          }}
          autoComplete="off"
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {t('edit.saveError')}
        </p>
      ) : null}

      {relinking ? (
        <TargetList
          autoFocus
          className="flex-1"
          rows={rows}
          placed={placed}
          standLabel={stand}
          pickLabel={(r) => t('edit.linkTo', { name: r.name })}
          onPick={(r) => {
            guard(updatePin(raw, { targetId: r.id }))
            setRelinking(false)
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setRelinking(true)}>
            {pin.targetId ? t('edit.relink') : t('edit.link')}
          </Button>
          {pin.targetId ? (
            <Button
              variant="secondary"
              disabled={!canUnlink}
              title={canUnlink ? undefined : t('edit.unlinkNeedsStand')}
              onClick={() =>
                guard(updatePin(raw, { targetId: null, standLabel: raw.standLabel ?? pin.stand }))
              }
            >
              <Unlink aria-hidden className="size-4" />
              {t('edit.unlink')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onMove}>
            <Move aria-hidden className="size-4" />
            {t('edit.move')}
          </Button>
          <Button variant="danger" onClick={onRemove}>
            <Trash2 aria-hidden className="size-4" />
            {t('edit.remove')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('edit.close')}
          </Button>
        </div>
      )}
      {relinking ? (
        <Button variant="ghost" className="self-start" onClick={() => setRelinking(false)}>
          {t('edit.cancel')}
        </Button>
      ) : null}
    </section>
  )
}
