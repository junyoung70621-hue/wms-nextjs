import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import RackMapContent from './RackMapContent'

export default async function RackMapPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  const { role } = session.user
  if (role !== 'admin' && role !== 'materials' && role !== 'manager') {
    redirect('/dashboard')
  }

  return <RackMapContent user={session.user} />
}
