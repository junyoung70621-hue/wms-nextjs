import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import MaterialRequestsContent from './MaterialRequestsContent'

export default async function MaterialRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role === 'guest') redirect('/dashboard')

  const { tab } = await searchParams
  return <MaterialRequestsContent user={session.user} initialTab={tab} />
}
