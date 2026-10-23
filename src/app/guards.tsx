import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { EmptyState, ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { useCan } from '@/features/auth-team/roles'
import { useSession } from '@/features/auth-team/session'
import type { PermissionKey } from '@/lib/permissions'

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

/** Page qui demande un droit (la base refuse de toute façon l'écriture sans lui) : un admin l'a toujours. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const allowed = useCan(permission)
  if (allowed) return <>{children}</>
  return (
    <EmptyState
      icon={<Lock className="size-10" />}
      title={t('roles.noPermission')}
      body={t('roles.noPermissionBody')}
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
