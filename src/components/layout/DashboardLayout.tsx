import type { SessionUser } from '@/lib/session'
import SessionGuard from './SessionGuard'
import SidebarShell from './SidebarShell'

interface DashboardLayoutProps {
  user: SessionUser
  children: React.ReactNode
}

export default function DashboardLayout({
  user,
  children,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      <SessionGuard />
      <SidebarShell user={user}>{children}</SidebarShell>
    </div>
  )
}
