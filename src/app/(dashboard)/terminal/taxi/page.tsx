import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import TaxiTerminalContent from '../TaxiTerminalContent'

export default async function TaxiTerminalPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <TaxiTerminalContent user={session.user} />
}
