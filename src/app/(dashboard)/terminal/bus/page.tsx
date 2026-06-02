import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import TerminalContent from '../TerminalContent'

export default async function BusTerminalPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <TerminalContent type="bus" user={session.user} />
}
