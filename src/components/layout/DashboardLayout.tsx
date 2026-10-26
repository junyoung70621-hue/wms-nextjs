import type { SessionUser } from '@/lib/session'
import SessionGuard from './SessionGuard'
import SidebarShell from './SidebarShell'

interface DashboardLayoutProps {
  user: SessionUser | null
  children: React.ReactNode
}

export default function DashboardLayout({
  user,
  children,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-[#F6F6F7]">
      {user && <SessionGuard />}
      <SidebarShell user={user}>{children}</SidebarShell>
    </div>
  )
}
