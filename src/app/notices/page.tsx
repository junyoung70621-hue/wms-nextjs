import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import NoticesContent from './NoticesContent'

export default async function NoticesPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return (
    <DashboardLayout user={session.user!} title="공지사항">
      <NoticesContent isAdmin={session.user!.role === 'admin'} />
    </DashboardLayout>
  )
}
