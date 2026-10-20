import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { Loading } from '@/components/page-states'
import { AppLayout } from './app-layout'
import { RedirectIfSignedIn, RequireAdmin, RequireReady, RequireSignedIn } from './guards'

const LoginPage = lazy(() => import('@/features/auth-team/login-page'))
const ForgotPasswordPage = lazy(() => import('@/features/auth-team/forgot-password-page'))
const ResetPasswordPage = lazy(() => import('@/features/auth-team/reset-password-page'))
const SignupPage = lazy(() => import('@/features/auth-team/signup-page'))
const OnboardingPage = lazy(() => import('@/features/auth-team/onboarding-page'))
const EventsPage = lazy(() => import('@/features/events/events-page'))
const EventLayout = lazy(() => import('@/features/events/event-layout'))
const EventDetailPage = lazy(() => import('@/features/events/event-detail-page'))
const PreparePage = lazy(() => import('@/features/prepare/prepare-page'))
const TeamPage = lazy(() => import('@/features/prepare/team-page'))
const PlanPage = lazy(() => import('@/features/plan/plan-page'))
const BilanPage = lazy(() => import('@/features/exports/bilan-page'))
const ExportsPage = lazy(() => import('@/features/exports/exports-page'))
const MyListPage = lazy(() => import('@/features/prepare/my-list-page'))
const ImportPage = lazy(() => import('@/features/import/import-page'))
const SettingsPage = lazy(() => import('@/features/settings/settings-page'))
const NotFoundPage = lazy(() => import('@/features/not-found-page'))

const router = createBrowserRouter([
  {
    element: <RedirectIfSignedIn />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  // Sans garde : le lien de l'e-mail ouvre une session de récupération, qui ne doit pas être renvoyée vers /events.
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireSignedIn />,
    children: [{ path: '/onboarding', element: <OnboardingPage /> }],
  },
  {
    element: <RequireReady />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/events" replace /> },
          { path: '/events', element: <EventsPage /> },
          {
            path: '/events/:eventId/import',
            element: (
              <RequireAdmin>
                <ImportPage />
              </RequireAdmin>
            ),
          },
          {
            path: '/events/:eventId',
            element: <EventLayout />,
            children: [
              { index: true, element: <EventDetailPage /> },
              { path: 'participants', element: <PreparePage /> },
              { path: 'my-list', element: <MyListPage /> },
              { path: 'team', element: <TeamPage /> },
              { path: 'plan', element: <PlanPage /> },
              { path: 'bilan', element: <BilanPage /> },
              { path: 'exports', element: <ExportsPage /> },
            ],
          },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export function AppRouter() {
  return (
    <Suspense fallback={<Loading />}>
      <RouterProvider router={router} />
    </Suspense>
  )
}
