import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import BusTerminalContent from '../BusTerminalContent'

export default async function BusTerminalPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <BusTerminalContent user={session.user} />
}
