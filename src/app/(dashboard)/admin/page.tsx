import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import GuestPreview from '@/components/auth/GuestPreview'
import AdminContent from './AdminContent'

export default async function AdminPage() {
  const session = await getSession()
  if (!session.user) return <GuestPreview />
  if (session.user.role !== 'admin') redirect('/dashboard')

  return <AdminContent user={session.user} />
}
