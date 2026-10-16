import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { InputField, SelectField, TextareaField } from '@/components/ui/field'
import { fetchTags } from '@/db/repositories/targets'
import { PRIORITIES } from '@/db/schemas/prepare'
import { useReadySession } from '@/features/auth-team/session'
import { useAsync } from '@/lib/use-async'
import { addCompanyManually, type AddCompanyResult } from './add-company'
import { ContactFields } from './contact-fields'
import {
  emptyCompanyForm,
  validateCompany,
  type CompanyErrors,
  type CompanyForm,
} from './lib/manual'

type Props = {
  eventId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (result: AddCompanyResult, name: string) => void
}

/** Ajout d'une entreprise (et de son contact clé) sans passer par un fichier. */
export function AddCompanyDialog({ eventId, open, onOpenChange, onAdded }: Props) {
  const { t } = useTranslation('manual')
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('company.title')}
      description={t('company.body')}
    >
      {/* Démonté à la fermeture : le formulaire repart vide à chaque ouverture. */}
      <CompanyForm eventId={eventId} onClose={() => onOpenChange(false)} onAdded={onAdded} />
    </Dialog>
  )
}

function CompanyForm({
  eventId,
  onClose,
  onAdded,
}: Pick<Props, 'eventId' | 'onAdded'> & { onClose: () => void }) {
  const { t } = useTranslation('manual')
  const { t: tc } = useTranslation()
  const { session, membership } = useReadySession()
  const tags = useAsync(fetchTags, [])
  const [form, setForm] = useState<CompanyForm>(emptyCompanyForm)
  const [assignToMe, setAssignToMe] = useState(true)
  const [errors, setErrors] = useState<CompanyErrors>({})
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const set =
    (k: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next = validateCompany(form)
    setErrors(next)
    setFailed(false)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    try {
      const result = await addCompanyManually({
        teamId: membership.teamId,
        eventId,
        meId: session.user.id,
        assignToMe,
        form,
      })
      onClose()
      onAdded(result, form.name.trim())
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <InputField
        label={t('company.name')}
        value={form.name}
        onChange={set('name')}
        autoComplete="off"
        error={errors.name ? t('company.nameRequired') : undefined}
      />
      <div className="grid grid-cols-2 gap-3">
        <InputField
          label={t('company.website')}
          value={form.website}
          onChange={set('website')}
          autoComplete="off"
          error={errors.website ? t('company.websiteInvalid') : undefined}
        />
        <InputField label={t('company.stand')} value={form.stand} onChange={set('stand')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <InputField
          label={t('company.industry')}
          value={form.industry}
          onChange={set('industry')}
        />
        <InputField label={t('company.city')} value={form.city} onChange={set('city')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label={t('company.priority')} value={form.priority} onChange={set('priority')}>
          <option value="">{t('company.noPriority')}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('company.tag')} value={form.tag} onChange={set('tag')}>
          <option value="">{t('company.noTag')}</option>
          {(tags.data ?? []).map((tag) => (
            <option key={tag.id} value={tag.label}>
              {tag.label}
            </option>
          ))}
        </SelectField>
      </div>

      <TextareaField
        label={t('company.history')}
        value={form.history}
        placeholder={t('company.historyPlaceholder')}
        onChange={(e) => setForm({ ...form, history: e.target.value })}
      />

      <fieldset className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold">{t('company.contactTitle')}</legend>
        <ContactFields
          value={form.contact}
          errors={errors.contact}
          onChange={(contact) => setForm({ ...form, contact })}
        />
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={assignToMe}
          onChange={(e) => setAssignToMe(e.target.checked)}
        />
        {t('company.assignToMe')}
      </label>

      {failed ? (
        <p role="alert" className="text-sm text-red-700">
          {t('company.error')}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {tc('actions.cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {t('company.submit')}
        </Button>
      </div>
    </form>
  )
}
