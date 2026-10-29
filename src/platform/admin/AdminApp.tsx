import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/app-shell'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { useMe } from '../session'
import { AuditPage } from './AuditPage'
import { EmailsPage } from './EmailsPage'
import { InvitesPage } from './InvitesPage'
import { LeadsPage } from './LeadsPage'
import { OnboardingDetailPage } from './OnboardingDetailPage'
import { OnboardingsPage } from './OnboardingsPage'
import { OverviewPage } from './OverviewPage'
import { PlanDetailPage } from './PlanDetailPage'
import { PlansPage } from './PlansPage'
import { SettingsPage } from './SettingsPage'
import { SignupsPage } from './SignupsPage'
import { TestingPage } from './TestingPage'

/** Back office : bloc Efferd app-shell-2, réservé aux administrateurs (le serveur vérifie aussi chaque appel). */
export default function AdminApp() {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) {
    return (
      <AppShell>
        <DashboardSkeleton />
      </AppShell>
    )
  }
  if (!me.data) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (me.data.role !== 'admin') return <Navigate to="/account" replace />

  return (
    <AppShell>
      <Routes>
        <Route index element={<OverviewPage />} />
        <Route path="signups" element={<SignupsPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="invitations" element={<InvitesPage />} />
        <Route path="onboardings" element={<OnboardingsPage />} />
        <Route path="testing" element={<TestingPage />} />
        <Route path="onboardings/:id" element={<OnboardingDetailPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="plans/:id" element={<PlanDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="log" element={<AuditPage />} />
        {/* Anciennes adresses en français */}
        <Route path="inscriptions" element={<Navigate to="/admin/signups" replace />} />
        <Route path="administration" element={<Navigate to="/admin/settings" replace />} />
        <Route path="journal" element={<Navigate to="/admin/log" replace />} />
        <Route path="emails" element={<EmailsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AppShell>
  )
}
