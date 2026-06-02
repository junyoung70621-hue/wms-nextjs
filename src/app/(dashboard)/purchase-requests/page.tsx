import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import PurchaseRequestsContent from './PurchaseRequestsContent'

export default async function PurchaseRequestsPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role === 'guest') redirect('/dashboard')

  return <PurchaseRequestsContent user={session.user} />
}
