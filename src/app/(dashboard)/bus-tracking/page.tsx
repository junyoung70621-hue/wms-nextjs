import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import BusTrackingContent from './BusTrackingContent'

export default async function BusTrackingPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <BusTrackingContent user={session.user} />
}
