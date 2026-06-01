import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import UsageContent from './UsageContent'

export default async function UsagePage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role === 'guest') redirect('/dashboard')

  return (
    <DashboardLayout user={session.user!} title="사용내역">
      <UsageContent user={session.user!} />
    </DashboardLayout>
  )
}
