import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import AdminContent from './AdminContent'

export default async function AdminPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  return (
    <DashboardLayout user={session.user} title="관리자">
      <AdminContent user={session.user} />
    </DashboardLayout>
  )
}
