import { ExternalLink, MapPin, Settings2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { SelectField, TextareaField } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { fetchContacts } from '@/db/repositories/targets'
import { GOALS, type Goal, type Target } from '@/db/schemas/prepare'
import { cn } from '@/lib/cn'
import { useAsync } from '@/lib/use-async'
import { PriorityPicker } from './atoms'
import { HistorySection } from './history-section'
import { isContested } from './lib/misc'
import { PlanningSection } from './planning-section'
import { TagManagerDialog } from './tag-manager-dialog'
import { useAssignFlow } from './use-assign-flow'
import type { TargetsApi } from './use-targets'

type Props = {
  target: Target | undefined
  api: TargetsApi
  meId: string
  eventName: string
  eventDate: string
  onClose: () => void
}

function Section({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4">{children}</div>
}

/** Fiche détaillée d'une entreprise ciblée : préparation, tags, commerciaux, rendez-vous, contacts, historique. */
export function TargetSheet({ target, api, meId, eventName, eventDate, onClose }: Props) {
  const { t } = useTranslation('prepare')
  return (
    <Sheet
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={target?.name ?? ''}
      closeLabel={t('sheet.close')}
    >
      {target ? (
        <Body
          key={target.id}
          target={target}
          api={api}
          meId={meId}
          eventName={eventName}
          eventDate={eventDate}
        />
      ) : null}
    </Sheet>
  )
}

function Body({
  target,
  api,
  meId,
  eventName,
  eventDate,
}: Omit<Props, 'onClose' | 'target'> & { target: Target }) {
  const { t } = useTranslation('prepare')
  const { data: contacts, error: contactsError } = useAsync(
    () => fetchContacts(target.companyId),
    [target.companyId],
  )
  const [comment, setComment] = useState(target.prepComment)
  const [savedComment, setSavedComment] = useState(target.prepComment)
  const [managingTags, setManagingTags] = useState(false)
  const { request, dialog } = useAssignFlow(api, api.targets)

  // Fermer la fiche (Échap, fond) pendant la saisie ne doit pas perdre le commentaire : on l'enregistre au démontage.
  const latest = useRef({ comment, savedComment })
  useEffect(() => {
    latest.current = { comment, savedComment }
  })
  const setPrepComment = api.actions.setPrepComment
  const targetId = target.id
  useEffect(
    () => () => {
      if (latest.current.comment !== latest.current.savedComment) {
        void setPrepComment(targetId, latest.current.comment)
      }
    },
    [setPrepComment, targetId],
  )
  const tags = api.tags
  const available = api.members.filter((m) => !target.assigneeIds.includes(m.userId))
  const location = [target.city, target.country].filter(Boolean).join(', ')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-sm text-slate-700">
        {target.stand || target.industry ? (
          <p>
            {[target.stand && t('sheet.stand', { stand: target.stand }), target.industry]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        {location ? (
          <p className="flex items-center gap-1.5">
            <MapPin aria-hidden className="size-4" />
            {location}
          </p>
        ) : null}
        {target.website ? (
          <a
            href={target.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-700 inline-flex min-h-8 items-center gap-1.5 break-all underline"
          >
            <ExternalLink aria-hidden className="size-4 shrink-0" />
            {target.website.replace(/^https?:\/\//, '')}
          </a>
        ) : null}
      </div>

      <Section title={t('sheet.prep')}>
        <PriorityPicker
          value={target.priority}
          onChange={(p) => void api.actions.setPriority([target.id], p)}
        />
        <SelectField
          label={t('goal.label')}
          value={target.goal ?? ''}
          onChange={(e) =>
            void api.actions.setGoal([target.id], (e.target.value || null) as Goal | null)
          }
        >
          <option value="">{t('goal.none')}</option>
          {GOALS.map((g) => (
            <option key={g} value={g}>
              {t(`goal.${g}`)}
            </option>
          ))}
        </SelectField>
        <TextareaField
          label={t('sheet.comment')}
          placeholder={t('sheet.commentPlaceholder')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => {
            if (comment !== savedComment) {
              setSavedComment(comment)
              void api.actions.setPrepComment(target.id, comment)
            }
          }}
        />
      </Section>

      <Section
        title={t('sheet.tags')}
        action={
          <Button variant="ghost" className="min-h-9" onClick={() => setManagingTags(true)}>
            <Settings2 aria-hidden className="size-4" />
            {t('sheet.manageTags')}
          </Button>
        }
      >
        <div role="group" aria-label={t('sheet.tags')} className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const on = target.tagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={on}
                onClick={() => void api.actions.toggleTag([target.id], tag.id, !on)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium md:min-h-9',
                  on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white',
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.label}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title={t('sheet.assignees')}>
        {isContested(target) ? (
          <p
            role="alert"
            className="rounded-lg bg-amber-100 p-3 text-sm font-medium text-amber-950"
          >
            {t('assign.contested', {
              count: target.assigneeIds.length,
              names: target.assigneeIds
                .map((u) => (u === meId ? t('assign.me') : api.memberName(u)))
                .join(', '),
            })}
          </p>
        ) : null}
        <ul className="flex flex-wrap gap-2">
          {target.assigneeIds.map((u) => (
            <li
              key={u}
              className="inline-flex min-h-11 items-center gap-1 rounded-full bg-slate-100 pr-1 pl-3 text-sm md:min-h-9"
            >
              {u === meId ? t('assign.me') : api.memberName(u)}
              <button
                type="button"
                aria-label={t('sheet.removeAssignee', { name: api.memberName(u) })}
                onClick={() => void api.actions.unassign([target.id], u)}
                className="inline-flex size-9 items-center justify-center rounded-full hover:bg-slate-200 md:size-7"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
          {target.assigneeIds.length === 0 ? (
            <li className="text-sm text-slate-600">{t('assign.unassigned')}</li>
          ) : null}
        </ul>
        {available.length > 0 ? (
          <label>
            <span className="sr-only">{t('sheet.addAssignee')}</span>
            <select
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base md:text-sm"
              value=""
              onChange={(e) => e.target.value && request([target.id], e.target.value)}
            >
              <option value="">{t('sheet.addAssignee')}</option>
              {available.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.userId === meId ? t('assign.me') : m.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </Section>

      <Card>
        <PlanningSection
          target={target}
          members={api.members}
          meId={meId}
          nameOf={api.memberName}
          api={api}
          eventName={eventName}
          defaultDate={eventDate}
        />
      </Card>

      <Section title={t('sheet.contacts')}>
        {contactsError ? (
          <p className="text-sm text-red-700">{t('sheet.contactsLoadError')}</p>
        ) : null}
        {contacts?.length === 0 ? (
          <p className="text-sm text-slate-600">{t('sheet.noContacts')}</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {contacts?.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-100 p-3 text-sm">
              <p className="font-medium">{c.name || c.email}</p>
              {c.jobTitle ? <p className="text-slate-700">{c.jobTitle}</p> : null}
              <p className="flex flex-wrap gap-x-4 text-slate-700">
                {c.email ? (
                  <a
                    className="text-brand-700 inline-flex min-h-8 items-center underline"
                    href={`mailto:${c.email}`}
                  >
                    {c.email}
                  </a>
                ) : null}
                {c.phone ? (
                  <a
                    className="text-brand-700 inline-flex min-h-8 items-center underline"
                    href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
                  >
                    {c.phone}
                  </a>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Card>
        <HistorySection companyId={target.companyId} eventId={target.eventId} />
      </Card>

      <TagManagerDialog open={managingTags} onOpenChange={setManagingTags} api={api} />
      {dialog}
    </div>
  )
}
