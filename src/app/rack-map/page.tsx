import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RackMapContent from './RackMapContent'

export default async function RackMapPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  const { role } = session.user
  if (role !== 'admin' && role !== 'materials' && role !== 'manager') {
    redirect('/dashboard')
  }

  return (
    <DashboardLayout user={session.user} title="위치 지도">
      <RackMapContent user={session.user} />
    </DashboardLayout>
  )
}
