import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import MaterialRequestsContent from './MaterialRequestsContent'

export default async function MaterialRequestsPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role === 'guest') redirect('/dashboard')

  return <MaterialRequestsContent user={session.user} />
}
