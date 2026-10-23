import { useTranslation } from 'react-i18next'
import { fetchTeamLogoUrl } from '@/db/repositories/teams'
import { useReadySession } from '@/features/auth-team/session'
import { useAsync } from '@/lib/use-async'

/** Logo de l'équipe, centré en haut de l'accueil. Rien du tout (pas de place réservée) sans logo ou sans réseau. */
export function TeamLogoBanner() {
  const { t } = useTranslation('events')
  const { membership } = useReadySession()
  const logo = useAsync(() => fetchTeamLogoUrl(membership.teamId), [membership.teamId])
  if (!logo.data) return null
  return (
    <div className="flex justify-center pb-4 md:pb-6">
      <img
        src={logo.data}
        alt={t('teamLogoAlt', { team: membership.teamName })}
        className="max-h-16 max-w-[min(100%,16rem)] object-contain md:max-h-20"
      />
    </div>
  )
}
