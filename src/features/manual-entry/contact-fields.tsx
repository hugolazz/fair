import { useTranslation } from 'react-i18next'
import { InputField } from '@/components/ui/field'
import type { ContactErrors, ContactForm } from './lib/manual'

type Props = {
  value: ContactForm
  errors?: ContactErrors | undefined
  onChange: (next: ContactForm) => void
}

/** Les six champs d'un contact, chacun dans sa case : ils se rangent tels quels dans les colonnes de l'export. */
export function ContactFields({ value, errors, onChange }: Props) {
  const { t } = useTranslation('manual')
  const set = (k: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value })
  const identity = errors?.identity ? t('contact.identityRequired') : undefined
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <InputField
          label={t('contact.firstName')}
          value={value.firstName}
          onChange={set('firstName')}
          autoComplete="off"
          error={identity}
        />
        <InputField
          label={t('contact.lastName')}
          value={value.lastName}
          onChange={set('lastName')}
          autoComplete="off"
        />
      </div>
      <InputField
        label={t('contact.jobTitle')}
        value={value.jobTitle}
        onChange={set('jobTitle')}
        autoComplete="off"
      />
      <InputField
        label={t('contact.email')}
        type="email"
        inputMode="email"
        value={value.email}
        onChange={set('email')}
        autoComplete="off"
        error={errors?.email ? t('contact.emailInvalid') : undefined}
      />
      <InputField
        label={t('contact.phone')}
        type="tel"
        inputMode="tel"
        value={value.phone}
        onChange={set('phone')}
        autoComplete="off"
      />
      <InputField
        label={t('contact.linkedin')}
        type="url"
        inputMode="url"
        value={value.linkedin}
        onChange={set('linkedin')}
        autoComplete="off"
        placeholder="https://www.linkedin.com/in/…"
        error={errors?.linkedin ? t('contact.linkedinInvalid') : undefined}
      />
    </div>
  )
}
