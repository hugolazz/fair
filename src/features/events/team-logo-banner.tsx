import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchTeamLogoUrl } from '@/db/repositories/teams'
import { useReadySession } from '@/features/auth-team/session'
import { useAsync } from '@/lib/use-async'
import { useMediaQuery } from '@/lib/use-media-query'

/** Adresse du logo de l'équipe ; `null` sans logo (ou sans réseau : l'adresse signée vient du stockage). */
function useTeamLogo() {
  const { membership } = useReadySession()
  const logo = useAsync(() => fetchTeamLogoUrl(membership.teamId), [membership.teamId])
  return { url: logo.data ?? null, teamName: membership.teamName }
}

/** Ordinateur : le logo occupe le centre de l'en-tête, et mène à l'accueil. Rien sans logo. */
export function HeaderLogo() {
  const wide = useMediaQuery('(min-width: 768px)')
  // Un seul des deux affichages est monté : une seule demande d'adresse signée par page.
  return wide ? <HeaderLogoImage /> : <span aria-hidden />
}

function HeaderLogoImage() {
  const { t } = useTranslation('events')
  const { url, teamName } = useTeamLogo()
  if (!url) return <span aria-hidden />
  return (
    <Link to="/events" className="inline-flex min-h-11 items-center justify-center rounded-lg">
      <img
        src={url}
        alt={t('teamLogoAlt', { team: teamName })}
        className="max-h-11 max-w-[min(100%,16rem)] object-contain"
      />
    </Link>
  )
}

/** Mobile : le logo est centré en haut de l'accueil. Rien du tout (pas de place réservée) sans logo. */
export function TeamLogoBanner() {
  const wide = useMediaQuery('(min-width: 768px)')
  return wide ? null : <TeamLogoBannerImage />
}

function TeamLogoBannerImage() {
  const { t } = useTranslation('events')
  const { url, teamName } = useTeamLogo()
  if (!url) return null
  return (
    <div className="flex justify-center pb-4">
      <img
        src={url}
        alt={t('teamLogoAlt', { team: teamName })}
        className="max-h-16 max-w-[min(100%,16rem)] object-contain"
      />
    </div>
  )
}
