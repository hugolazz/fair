import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useParams } from 'react-router-dom'
import { Loading } from '@/components/page-states'
import { useReadySession } from '@/features/auth-team/session'
import { DownloadCard } from '@/features/offline/download-card'
import { usePinned } from '@/sync/offline-events'
import type { FieldOutletContext } from './field-context'

/**
 * Cadre plein écran du mode terrain (sans barre de navigation). Le salon doit avoir été téléchargé sur
 * l'appareil (choix explicite) ; la synchronisation, elle, tourne déjà en arrière-plan pour toute l'appli.
 * L'écran ne lit et n'écrit jamais que dans la base locale.
 */
export default function FieldLayout() {
  const { t } = useTranslation('offline')
  const { eventId = '' } = useParams()
  const { session, membership } = useReadySession()
  const pins = usePinned()
  const userId = session.user.id
  const teamId = membership.teamId

  const context = useMemo<FieldOutletContext>(
    () => ({ ctx: { teamId, eventId, userId } }),
    [teamId, eventId, userId],
  )

  if (pins === undefined) return <Loading />
  if (!pins.has(eventId)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-4">
        <h1 className="text-xl font-bold">{t('download.gateTitle')}</h1>
        <DownloadCard eventId={eventId} />
        <Link
          to={`/events/${eventId}`}
          className="text-brand-700 inline-flex min-h-11 items-center text-sm font-medium underline"
        >
          ←
        </Link>
      </main>
    )
  }
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <Outlet context={context} />
    </div>
  )
}
