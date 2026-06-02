import type { SessionUser } from '@/lib/session'
import SessionGuard from './SessionGuard'
import SidebarShell from './SidebarShell'

interface DashboardLayoutProps {
  user: SessionUser
  title: string
  children: React.ReactNode
}

export default function DashboardLayout({
  user,
  title,
  children,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      <SessionGuard />
      <SidebarShell user={user} title={title}>{children}</SidebarShell>
    </div>
  )
}
