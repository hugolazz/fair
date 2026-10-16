import { Settings2, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { InputField, TextareaField } from '@/components/ui/field'
import { updateCompany, updateTargets } from '@/db/repositories/targets'
import type { Target, TargetContact } from '@/db/schemas/prepare'
import { canPrepareTarget, useIsAdmin } from '@/features/auth-team/roles'
import { normalizeStand } from '@/features/import/lib/text'
import {
  emptyCompanyForm,
  toCompanyPatch,
  validateCompany,
  type CompanyErrors,
  type CompanyForm,
} from '@/features/manual-entry/lib/manual'
import { cn } from '@/lib/cn'
import { PriorityPicker } from './atoms'
import { ContactsEditor } from './contacts-editor'
import { isContested } from './lib/misc'
import { PlanningSection } from './planning-section'
import { TagManagerDialog } from './tag-manager-dialog'
import { useAssignFlow } from './use-assign-flow'
import type { TargetsApi } from './use-targets'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: Target
  api: TargetsApi
  meId: string
  eventName: string
  eventDate: string
  teamId: string
  contacts: readonly TargetContact[]
  onContactsChanged: () => void
}

function Section({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
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

/** « Modifier la fiche » : tous les attributs de l'entreprise au même endroit. */
export function EditTargetDialog({ open, onOpenChange, ...rest }: Props) {
  const { t } = useTranslation('prepare')
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('edit.title', { name: rest.target.name })}
    >
      {/* Monté seulement quand le dialogue est ouvert : le formulaire repart des valeurs à jour. */}
      <EditBody {...rest} />
    </Dialog>
  )
}

const formOf = (t: Target): CompanyForm => ({
  ...emptyCompanyForm,
  name: t.name,
  website: t.website,
  stand: t.stand,
  industry: t.industry,
  city: t.city,
  country: t.country,
  priority: t.priority ?? '',
  history: t.history,
})

function EditBody({
  target,
  api,
  meId,
  eventName,
  eventDate,
  teamId,
  contacts,
  onContactsChanged,
}: Omit<Props, 'open' | 'onOpenChange'>) {
  const { t } = useTranslation('prepare')
  const { t: tm } = useTranslation('manual')
  const admin = useIsAdmin()
  const canPrepare = canPrepareTarget(admin, target.assigneeIds, meId)
  const { request, dialog } = useAssignFlow(api, api.targets)
  const [form, setForm] = useState<CompanyForm>(() => formOf(target))
  const [errors, setErrors] = useState<CompanyErrors>({})
  const [problem, setProblem] = useState<'domain' | 'error'>()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [managingTags, setManagingTags] = useState(false)
  const set = (k: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false)
    setForm({ ...form, [k]: e.target.value })
  }
  // Un commercial ne s'assigne que lui-même ; un admin assigne n'importe qui.
  const available = api.members.filter(
    (m) => !target.assigneeIds.includes(m.userId) && (admin || m.userId === meId),
  )

  async function save(e: FormEvent) {
    e.preventDefault()
    const next = validateCompany(form)
    setErrors(next)
    setProblem(undefined)
    setSaved(false)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    try {
      await updateCompany(target.companyId, toCompanyPatch(form))
      // Priorité et stand sont ceux de ce salon : réservés à l'admin et au commercial assigné.
      if (canPrepare) {
        await updateTargets([target.id], {
          priority: form.priority || null,
          stand_label: normalizeStand(form.stand) || null,
        })
      }
      api.reload()
      setSaved(true)
    } catch (err) {
      setProblem((err as { code?: string }).code === '23505' ? 'domain' : 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        onSubmit={(e) => void save(e)}
        aria-label={t('edit.company')}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h3 className="font-semibold">{t('edit.company')}</h3>
        <InputField
          label={tm('company.name')}
          value={form.name}
          onChange={set('name')}
          autoComplete="off"
          error={errors.name ? tm('company.nameRequired') : undefined}
        />
        <InputField
          label={tm('company.website')}
          value={form.website}
          onChange={set('website')}
          autoComplete="off"
          error={errors.website ? tm('company.websiteInvalid') : undefined}
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField
            label={tm('company.industry')}
            value={form.industry}
            onChange={set('industry')}
          />
          <InputField
            label={tm('company.stand')}
            value={form.stand}
            onChange={set('stand')}
            disabled={!canPrepare}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InputField label={tm('company.city')} value={form.city} onChange={set('city')} />
          <InputField
            label={tm('company.country')}
            value={form.country}
            onChange={set('country')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-800">{tm('company.priority')}</span>
          <PriorityPicker
            value={form.priority || null}
            disabled={!canPrepare}
            onChange={(p) => {
              setSaved(false)
              setForm({ ...form, priority: p ?? '' })
            }}
          />
        </div>
        {!canPrepare ? (
          <p role="note" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-800">
            {t('sheet.prepReadOnly')}
          </p>
        ) : null}
        <TextareaField
          label={tm('company.history')}
          placeholder={tm('company.historyPlaceholder')}
          rows={6}
          value={form.history}
          onChange={(e) => {
            setSaved(false)
            setForm({ ...form, history: e.target.value })
          }}
        />
        {problem ? (
          <p role="alert" className="text-sm text-red-700">
            {t(problem === 'domain' ? 'edit.domainTaken' : 'edit.error')}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="text-sm font-medium text-emerald-800">
            {t('edit.saved')}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={busy} className="min-h-12">
            {t('edit.save')}
          </Button>
        </div>
      </form>

      <Section
        title={t('sheet.tags')}
        action={
          admin ? (
            <Button variant="ghost" className="min-h-9" onClick={() => setManagingTags(true)}>
              <Settings2 aria-hidden className="size-4" />
              {t('sheet.manageTags')}
            </Button>
          ) : undefined
        }
      >
        <div role="group" aria-label={t('sheet.tags')} className="flex flex-wrap gap-2">
          {api.tags.map((tag) => {
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
              {admin || u === meId ? (
                <button
                  type="button"
                  aria-label={t('sheet.removeAssignee', { name: api.memberName(u) })}
                  onClick={() => void api.actions.unassign([target.id], u)}
                  className="inline-flex size-9 items-center justify-center rounded-full hover:bg-slate-200 md:size-7"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : (
                <span className="w-3" />
              )}
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

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <PlanningSection
          target={target}
          members={api.members}
          meId={meId}
          nameOf={api.memberName}
          api={api}
          eventName={eventName}
          defaultDate={eventDate}
        />
      </div>

      <Section title={t('sheet.contacts')}>
        <ContactsEditor
          teamId={teamId}
          companyId={target.companyId}
          contacts={contacts}
          onChanged={onContactsChanged}
        />
      </Section>

      <TagManagerDialog open={managingTags} onOpenChange={setManagingTags} api={api} />
      {dialog}
    </div>
  )
}
