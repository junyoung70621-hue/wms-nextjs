import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardContent from './DashboardContent'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <DashboardContent user={session.user} />
}
