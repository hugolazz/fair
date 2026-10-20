import * as Popover from '@radix-ui/react-popover'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PopoverPanel } from '@/components/ui/popover-panel'
import type { TeamMember, Target } from '@/db/schemas/prepare'
import { ADD_DOT, Assignees } from './atoms'
import { OptionToggleList } from './filter-menu'

type Props = {
  target: Target
  members: readonly TeamMember[]
  meId: string
  nameOf: (userId: string) => string
  /** Un commercial ne gère que sa propre assignation (RLS) ; un admin assigne ou retire n'importe qui. */
  admin: boolean
  onAssign: (userId: string) => void
  onUnassign: (userId: string) => void
}

/**
 * Les commerciaux d'une entreprise dans le tableau (initiales, ou « + » si personne) : un clic ouvre la liste de
 * l'équipe pour assigner ou retirer quelqu'un. Choisir un collègue déjà ciblé passe par l'alerte « Remplacer / Ajouter ».
 */
export function AssignPicker({
  target,
  members,
  meId,
  nameOf,
  admin,
  onAssign,
  onUnassign,
}: Props) {
  const { t } = useTranslation('prepare')
  const [open, setOpen] = useState(false)
  const choices = members.filter((m) => admin || m.userId === meId)
  const who = target.assigneeIds.length
    ? target.assigneeIds.map((u) => (u === meId ? t('assign.me') : nameOf(u))).join(', ')
    : t('assign.unassigned')

  // Sans choix possible (équipe non chargée), on n'affiche que l'état, sans bouton.
  if (choices.length === 0) return <Assignees target={target} nameOf={nameOf} meId={meId} compact />

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('assign.editFor', { name: target.name, who })}
          className="focus-visible:outline-brand-600 group -mx-1 flex min-h-8 items-center rounded-full px-1 hover:bg-slate-100"
        >
          {target.assigneeIds.length === 0 ? (
            <span
              className={`${ADD_DOT} group-hover:border-brand-600 group-hover:text-brand-600`}
              aria-hidden
            >
              <span>+</span>
            </span>
          ) : (
            <Assignees target={target} nameOf={nameOf} meId={meId} compact />
          )}
        </button>
      </Popover.Trigger>
      <PopoverPanel aria-label={t('assign.panelTitle')} className="min-w-48">
        <OptionToggleList
          options={choices.map((m) => ({
            key: m.userId,
            label: m.userId === meId ? t('assign.meNamed', { name: m.name }) : m.name,
          }))}
          selected={target.assigneeIds}
          onToggle={(userId) => {
            setOpen(false)
            if (target.assigneeIds.includes(userId)) onUnassign(userId)
            else onAssign(userId)
          }}
        />
      </PopoverPanel>
    </Popover.Root>
  )
}
