import { Trash2, X } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { PRIORITIES, type Priority, type Tag, type TeamMember } from '@/db/schemas/prepare'
import { useCan } from '@/features/auth-team/roles'

type Props = {
  count: number
  tags: Tag[]
  members: TeamMember[]
  meId: string
  onPriority: (p: Priority | null) => void
  onTag: (tagId: string) => void
  onAssign: (userId: string) => void
  /** Retrait des participants du salon (droit « retirer des participants »). */
  onRemove: () => void
  onClear: () => void
}

const selectCls =
  'min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm md:min-h-9'

/** Barre d'actions en masse : chaque liste applique son choix tout de suite à la sélection. */
export function BulkBar(p: Props) {
  const { t } = useTranslation('prepare')
  const canAssignOthers = useCan('assign_others')
  const canRemove = useCan('remove_participants')

  /** Applique la valeur choisie puis remet la liste sur son libellé. */
  const pick = (apply: (value: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value
    e.target.value = ''
    if (v !== '') apply(v)
  }
  const memberOptions = [
    <option key="me" value={p.meId}>
      {t('assign.me')}
    </option>,
    // Sans le droit « assigner des collègues », on ne s'assigne que soi-même (RLS).
    ...(canAssignOthers ? p.members : [])
      .filter((m) => m.userId !== p.meId)
      .map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.name}
        </option>
      )),
  ]

  return (
    <div
      role="toolbar"
      aria-label={t('bulk.label')}
      className="border-brand-600 bg-brand-50 fixed inset-x-0 bottom-[env(safe-area-inset-bottom)] z-20 flex flex-wrap items-center gap-1.5 border-t-2 px-3 py-2 shadow-lg md:sticky md:inset-x-auto md:bottom-0 md:z-10 md:gap-2 md:rounded-xl md:border-2"
    >
      <p role="status" className="mr-1 text-sm font-semibold">
        {/* Sur mobile, juste le nombre (la barre tient sur une ligne) ; le texte complet reste lu par les lecteurs d'écran. */}
        <span aria-hidden className="md:hidden">
          {p.count}
        </span>
        <span className="sr-only md:not-sr-only">{t('select.count', { count: p.count })}</span>
      </p>
      <Select
        aria-label={t('bulk.priority')}
        className={selectCls}
        defaultValue=""
        onChange={pick((v) => p.onPriority(v === 'none' ? null : (v as Priority)))}
      >
        <option value="">{t('bulk.priority')}</option>
        {PRIORITIES.map((x) => (
          <option key={x} value={x}>
            {t(`priority.${x}`)}
          </option>
        ))}
        <option value="none">{t('priority.none')}</option>
      </Select>
      <Select
        aria-label={t('bulk.addTag')}
        className={selectCls}
        defaultValue=""
        onChange={pick(p.onTag)}
      >
        <option value="">{t('bulk.addTag')}</option>
        {p.tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.label}
          </option>
        ))}
      </Select>
      <Select
        aria-label={t('bulk.assign')}
        className={selectCls}
        defaultValue=""
        onChange={pick(p.onAssign)}
      >
        <option value="">{t('bulk.assign')}</option>
        {memberOptions}
      </Select>
      {canRemove ? (
        <Button
          variant="ghost"
          className="text-danger min-h-11 px-3 md:min-h-9 md:px-4"
          onClick={p.onRemove}
        >
          <Trash2 aria-hidden className="size-4" />
          <span className="sr-only md:not-sr-only">{t('remove.action')}</span>
        </Button>
      ) : null}
      <Button
        variant="ghost"
        className="ml-auto min-h-11 px-3 md:min-h-9 md:px-6"
        onClick={p.onClear}
      >
        <X aria-hidden className="size-4" />
        <span className="sr-only md:not-sr-only">{t('select.clear')}</span>
      </Button>
    </div>
  )
}
