import { useEffect, useMemo } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useReadySession } from '@/features/auth-team/session'
import { startSync } from '@/sync/manager'
import type { FieldOutletContext } from './field-context'

/**
 * Cadre plein écran du mode terrain (sans barre de navigation). Lance la synchronisation du salon en
 * arrière-plan : l'écran, lui, ne lit et n'écrit jamais que dans la base locale.
 */
export default function FieldLayout() {
  const { eventId = '' } = useParams()
  const { session, membership } = useReadySession()
  const userId = session.user.id
  const teamId = membership.teamId

  useEffect(() => startSync(eventId), [eventId])

  const context = useMemo<FieldOutletContext>(
    () => ({ ctx: { teamId, eventId, userId } }),
    [teamId, eventId, userId],
  )
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <Outlet context={context} />
    </div>
  )
}
