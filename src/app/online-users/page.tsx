import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import OnlineUsersContent from './OnlineUsersContent'

export default async function OnlineUsersPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  return (
    <DashboardLayout user={session.user} title="접속 현황">
      <OnlineUsersContent />
    </DashboardLayout>
  )
}
