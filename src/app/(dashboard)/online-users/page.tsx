import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import GuestPreview from '@/components/auth/GuestPreview'
import OnlineUsersContent from './OnlineUsersContent'

export default async function OnlineUsersPage() {
  const session = await getSession()
  if (!session.user) return <GuestPreview />
  if (session.user.role !== 'admin') redirect('/dashboard')

  return <OnlineUsersContent />
}
