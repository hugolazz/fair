import { ExternalLink, MapPin, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { fetchContacts } from '@/db/repositories/targets'
import type { Target, TargetContact } from '@/db/schemas/prepare'
import { useReadySession } from '@/features/auth-team/session'
import { useAsync } from '@/lib/use-async'
import { PriorityBadge, TagChip } from './atoms'
import { EditTargetDialog } from './edit-target-dialog'
import { HistorySection } from './history-section'
import { showsOf, showTiming } from './lib/shows'
import { MeetingNotepad } from './meeting-notepad'
import { ShowPills } from './show-pills'
import type { TargetsApi } from './use-targets'

type Props = {
  target: Target | undefined
  api: TargetsApi
  meId: string
  eventName: string
  eventDate: string
  onClose: () => void
}

/** Fiche d'une entreprise ciblée : l'essentiel d'un coup d'œil, l'historique, les notes de la rencontre. */
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

function ContactLinks({ c }: { c: TargetContact }) {
  const { t } = useTranslation('prepare')
  return (
    <p className="flex flex-wrap gap-x-4">
      {c.phone ? (
        <a
          className="text-brand-700 inline-flex min-h-11 items-center underline"
          href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
        >
          {c.phone}
        </a>
      ) : null}
      {c.email ? (
        <a
          className="text-brand-700 inline-flex min-h-11 items-center underline"
          href={`mailto:${c.email}`}
        >
          {c.email}
        </a>
      ) : null}
      {c.linkedin ? (
        <a
          className="text-brand-700 inline-flex min-h-11 items-center gap-1 underline"
          href={c.linkedin}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('sheet.linkedin')}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : null}
    </p>
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
  const { membership } = useReadySession()
  const { data: contacts, reload: reloadContacts } = useAsync(
    () => fetchContacts(target.companyId),
    [target.companyId],
  )
  const [editing, setEditing] = useState(false)
  const tagById = new Map(api.tags.map((tag) => [tag.id, tag]))
  const shown = showsOf(target.tagIds, api.shows)
  const keyContact = contacts?.[0]
  const otherContacts = contacts?.slice(1) ?? []
  const toRecontact = target.meetings.some((m) => m.recontact)
  const location = [target.city, target.country].filter(Boolean).join(', ')

  return (
    <div className="flex flex-col gap-5">
      {/* En un coup d'œil : priorité, typologie (tags), stand, contact clé. */}
      <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={target.priority} />
          {target.tagIds.map((id) => {
            const tag = tagById.get(id)
            return tag ? <TagChip key={id} tag={tag} /> : null
          })}
          {toRecontact ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
              {t('notepad.recontactBadge')}
            </span>
          ) : null}
        </div>
        <p className="text-slate-700">
          {[target.stand && t('sheet.stand', { stand: target.stand }), target.industry, location]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {shown.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-slate-200 pt-2">
            <span className="text-xs font-medium text-slate-600">{t('shows.title')}</span>
            <ShowPills tagIds={target.tagIds} shows={api.shows} />
            {shown.some((s) => showTiming(s.label)) ? (
              <span className="text-xs text-slate-600">{t('shows.legend')}</span>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-4">
          {target.website ? (
            <a
              href={target.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-700 inline-flex min-h-11 items-center gap-1.5 break-all underline"
            >
              <ExternalLink aria-hidden className="size-4 shrink-0" />
              {target.website.replace(/^https?:\/\//, '')}
            </a>
          ) : null}
          <Link
            to={`/events/${target.eventId}/plan?target=${target.id}`}
            className="text-brand-700 inline-flex min-h-11 items-center gap-1.5 underline"
          >
            <MapPin aria-hidden className="size-4 shrink-0" />
            {t('sheet.seeOnPlan')}
          </Link>
        </div>

        {keyContact ? (
          <div className="border-t border-slate-200 pt-2">
            <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
              {t('sheet.keyContact')}
            </p>
            <p className="text-base font-semibold">{keyContact.name || keyContact.email}</p>
            {keyContact.jobTitle ? <p className="text-slate-700">{keyContact.jobTitle}</p> : null}
            <ContactLinks c={keyContact} />
          </div>
        ) : contacts ? (
          <p className="border-t border-slate-200 pt-2 text-slate-600">{t('sheet.noContact')}</p>
        ) : null}
        {otherContacts.length > 0 ? (
          <details className="border-t border-slate-200 pt-1">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">
              {t('sheet.otherContacts', { count: otherContacts.length })}
            </summary>
            <ul className="flex flex-col gap-2 pb-1">
              {otherContacts.map((c) => (
                <li key={c.id}>
                  <p className="font-medium">{c.name || c.email}</p>
                  {c.jobTitle ? <p className="text-slate-700">{c.jobTitle}</p> : null}
                  <ContactLinks c={c} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <Button
          variant="secondary"
          className="mt-1 min-h-11 self-start"
          onClick={() => setEditing(true)}
        >
          <Pencil aria-hidden className="size-4" />
          {t('edit.button')}
        </Button>
      </div>

      <HistorySection
        companyId={target.companyId}
        eventId={target.eventId}
        history={target.history}
      />

      <MeetingNotepad
        target={target}
        api={api}
        nameOf={api.memberName}
        contacts={contacts ?? []}
        onContactAdded={() => reloadContacts()}
      />

      <EditTargetDialog
        open={editing}
        onOpenChange={setEditing}
        target={target}
        api={api}
        meId={meId}
        eventName={eventName}
        eventDate={eventDate}
        teamId={membership.teamId}
        contacts={contacts ?? []}
        onContactsChanged={() => reloadContacts()}
      />
    </div>
  )
}
