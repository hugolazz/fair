import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { setTeamAccent } from '@/db/repositories/teams'
import { useReadySession } from '@/features/auth-team/session'
import { ACCENT_PRESETS, applyAccent, buildAccentPalette, DEFAULT_ACCENT } from '@/lib/accent'
import { cn } from '@/lib/cn'

type Choice = { id: string; hex: string | null; swatch: string }

const CHOICES: Choice[] = [
  { id: 'green', hex: null, swatch: DEFAULT_ACCENT },
  ...ACCENT_PRESETS.map((p) => ({
    id: p.id,
    hex: p.hex,
    swatch: buildAccentPalette(p.hex)['600'],
  })),
]

/** Couleur d'accentuation de l'équipe (admins) : le vert d'origine, quelques couleurs, ou une couleur libre. */
export function AccentPicker() {
  const { t } = useTranslation('settings')
  const { membership, refreshMembership } = useReadySession()
  const saved = membership.accentColor?.toLowerCase() ?? null
  const [accent, setAccent] = useState<string | null>(saved)
  const [error, setError] = useState(false)
  const timer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Appliqué tout de suite à l'écran, enregistré après une courte pause (le sélecteur libre envoie une suite de valeurs).
  const choose = (hex: string | null) => {
    setAccent(hex)
    setError(false)
    applyAccent(hex)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setTeamAccent(membership.teamId, hex)
        .then(() => refreshMembership())
        .catch(() => {
          setAccent(saved)
          applyAccent(saved)
          setError(true)
        })
    }, 500)
  }
  const custom = accent !== null && !CHOICES.some((c) => c.hex === accent)

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={t('appearance.title')} className="flex flex-wrap gap-3">
        {CHOICES.map((c) => {
          const selected = c.hex === accent
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t(`appearance.colors.${c.id}`)}
              title={t(`appearance.colors.${c.id}`)}
              onClick={() => choose(c.hex)}
              className={cn(
                'inline-flex size-11 items-center justify-center rounded-full border-2 border-white text-white shadow-[0_0_0_1px_var(--color-slate-300)] transition-shadow duration-200',
                selected && 'shadow-[0_0_0_2px_var(--color-slate-900)]',
              )}
              style={{ backgroundColor: c.swatch }}
            >
              {selected ? <Check aria-hidden className="size-5" /> : null}
            </button>
          )
        })}
      </div>

      <label className="flex min-h-11 flex-wrap items-center gap-3">
        <input
          type="color"
          className="h-11 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
          value={custom ? accent : (accent ?? DEFAULT_ACCENT)}
          onChange={(e) => choose(e.target.value.toLowerCase())}
        />
        <span>
          {t('appearance.custom')}
          {custom ? <span className="text-slate-600"> ({t('appearance.active')})</span> : null}
        </span>
      </label>
      <p className="text-sm text-slate-700">{t('appearance.help')}</p>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {t('appearance.error')}
        </p>
      ) : null}

      {accent !== null ? (
        <div>
          <Button variant="secondary" onClick={() => choose(null)}>
            {t('appearance.reset')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
