import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState, PageHeader } from '@/components/page-states'

export default function CompaniesPage() {
  const { t } = useTranslation('companies')
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState
        icon={<Building2 className="size-10" />}
        title={t('empty.title')}
        body={t('empty.body')}
      />
    </>
  )
}
