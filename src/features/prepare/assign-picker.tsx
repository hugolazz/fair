import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui/select'
import type { TeamMember } from '@/db/schemas/prepare'

type Props = {
  /** Entreprise concernée (pour le libellé lu par les lecteurs d'écran). */
  companyName: string
  members: readonly TeamMember[]
  meId: string
  /** Un commercial ne s'assigne que lui-même (RLS) ; un admin assigne n'importe qui. */
  admin: boolean
  onPick: (userId: string) => void
}

/** Le « + » d'une entreprise sans commercial : il ouvre la liste de l'équipe pour choisir qui l'assigner. */
export function AssignPicker({ companyName, members, meId, admin, onPick }: Props) {
  const { t } = useTranslation('prepare')
  const choices = members.filter((m) => admin || m.userId === meId)
  if (choices.length === 0) return null
  return (
    <Select
      aria-label={t('assign.pickFor', { name: companyName })}
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
      display={<span aria-hidden>+</span>}
      className="hover:border-brand-600 hover:text-brand-600 focus-visible:outline-brand-600 inline-flex size-7 items-center justify-center rounded-full border border-dashed border-[#cfcbbf] text-[11px] font-semibold text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <option value="">{t('assign.pickPlaceholder')}</option>
      {choices.map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.userId === meId ? t('assign.me') : m.name}
        </option>
      ))}
    </Select>
  )
}
