import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import MypageContent from './MypageContent'

export default async function MypagePage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return (
    <DashboardLayout user={session.user!} title="마이페이지">
      <MypageContent user={session.user!} />
    </DashboardLayout>
  )
}
