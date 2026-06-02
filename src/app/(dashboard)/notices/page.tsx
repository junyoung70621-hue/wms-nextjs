import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import NoticesContent from './NoticesContent'

export default async function NoticesPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <NoticesContent isAdmin={session.user.role === 'admin'} />
}
