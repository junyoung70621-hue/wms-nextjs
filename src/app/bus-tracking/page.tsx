import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import BusTrackingContent from './BusTrackingContent'

export default async function BusTrackingPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return (
    <DashboardLayout user={session.user} title="센터 단말현황(버스)">
      <BusTrackingContent user={session.user} />
    </DashboardLayout>
  )
}
