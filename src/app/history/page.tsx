import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import HistoryContent from './HistoryContent'

export default async function HistoryPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return (
    <DashboardLayout user={session.user!} title="입출고 이력">
      <HistoryContent user={session.user!} />
    </DashboardLayout>
  )
}
