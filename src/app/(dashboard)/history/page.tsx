import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import HistoryContent from './HistoryContent'

export default async function HistoryPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <HistoryContent user={session.user} />
}
