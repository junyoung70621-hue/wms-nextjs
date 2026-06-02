import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import AdminContent from './AdminContent'

export default async function AdminPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  return <AdminContent user={session.user} />
}
