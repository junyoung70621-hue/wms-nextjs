import type { SessionUser } from '@/lib/session'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import SessionGuard from './SessionGuard'

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
      <TopBar user={user} title={title} />
      <Sidebar user={user} />
      <main className="ml-[220px] mt-[58px] min-h-[calc(100vh-58px)] p-6">
        {children}
      </main>
    </div>
  )
}
