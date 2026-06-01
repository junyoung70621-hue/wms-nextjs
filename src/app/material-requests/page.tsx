import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import MaterialRequestsContent from './MaterialRequestsContent'

export default async function MaterialRequestsPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role === 'guest') redirect('/dashboard')

  return (
    <DashboardLayout user={session.user!} title="자재 요청">
      <MaterialRequestsContent user={session.user!} />
    </DashboardLayout>
  )
}
