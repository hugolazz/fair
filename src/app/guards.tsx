import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { EmptyState, ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { useIsAdmin } from '@/features/auth-team/roles'
import { needsPassword, useSession } from '@/features/auth-team/session'

/** Redirige selon l'état : déconnecté → /login, sans équipe → /onboarding. */
export function RequireReady() {
  const s = useSession()
  if (s.status === 'loading') return <Loading />
  if (s.status === 'signedOut') return <Navigate to="/login" replace />
  if (s.status !== 'error' && needsPassword(s.session))
    return <Navigate to="/reset-password" replace />
  if (s.status === 'needsTeam') return <Navigate to="/onboarding" replace />
  if (s.status === 'error')
    return <ErrorState message={s.error.message} onRetry={() => void s.refreshMembership()} />
  return <Outlet />
}

/** Page réservée aux admins d'équipe (la base refuse de toute façon l'écriture à un commercial). */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const admin = useIsAdmin()
  if (admin) return <>{children}</>
  return (
    <EmptyState
      icon={<Lock className="size-10" />}
      title={t('roles.adminOnly')}
      body={t('roles.adminOnlyBody')}
      action={
        <Button asChild variant="secondary">
          <Link to="..">{t('actions.back')}</Link>
        </Button>
      }
    />
  )
}

export function RequireSignedIn() {
  const s = useSession()
  if (s.status === 'loading') return <Loading />
  if (s.status === 'signedOut') return <Navigate to="/login" replace />
  if (s.status !== 'error' && needsPassword(s.session))
    return <Navigate to="/reset-password" replace />
  if (s.status === 'ready') return <Navigate to="/events" replace />
  if (s.status === 'error')
    return <ErrorState message={s.error.message} onRetry={() => void s.refreshMembership()} />
  return <Outlet />
}

export function RedirectIfSignedIn() {
  const s = useSession()
  if (s.status === 'loading') return <Loading />
  if ((s.status === 'ready' || s.status === 'needsTeam') && needsPassword(s.session))
    return <Navigate to="/reset-password" replace />
  if (s.status === 'ready') return <Navigate to="/events" replace />
  if (s.status === 'needsTeam') return <Navigate to="/onboarding" replace />
  return <Outlet />
}
