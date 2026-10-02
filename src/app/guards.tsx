import { Navigate, Outlet } from 'react-router-dom'
import { ErrorState, Loading } from '@/components/page-states'
import { useSession } from '@/features/auth-team/session'

/** Redirige selon l'état : déconnecté → /login, sans équipe → /onboarding. */
export function RequireReady() {
  const s = useSession()
  if (s.status === 'loading') return <Loading />
  if (s.status === 'signedOut') return <Navigate to="/login" replace />
  if (s.status === 'needsTeam') return <Navigate to="/onboarding" replace />
  if (s.status === 'error')
    return <ErrorState message={s.error.message} onRetry={() => void s.refreshMembership()} />
  return <Outlet />
}

export function RequireSignedIn() {
  const s = useSession()
  if (s.status === 'loading') return <Loading />
  if (s.status === 'signedOut') return <Navigate to="/login" replace />
  if (s.status === 'ready') return <Navigate to="/events" replace />
  if (s.status === 'error')
    return <ErrorState message={s.error.message} onRetry={() => void s.refreshMembership()} />
  return <Outlet />
}

export function RedirectIfSignedIn() {
  const s = useSession()
  if (s.status === 'loading') return <Loading />
  if (s.status === 'ready') return <Navigate to="/events" replace />
  if (s.status === 'needsTeam') return <Navigate to="/onboarding" replace />
  return <Outlet />
}
