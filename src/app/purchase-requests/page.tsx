import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import PurchaseRequestsContent from './PurchaseRequestsContent'

export default async function PurchaseRequestsPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role === 'guest') redirect('/dashboard')

  return (
    <DashboardLayout user={session.user!} title="구매 요청">
      <PurchaseRequestsContent user={session.user!} />
    </DashboardLayout>
  )
}
