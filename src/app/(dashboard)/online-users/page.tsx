import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import OnlineUsersContent from './OnlineUsersContent'

export default async function OnlineUsersPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  return <OnlineUsersContent />
}
