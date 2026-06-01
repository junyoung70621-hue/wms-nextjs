import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import TerminalContent from '../TerminalContent'

export default async function BusTerminalPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return (
    <DashboardLayout user={session.user} title="버스단말기 현황">
      <TerminalContent type="bus" user={session.user} />
    </DashboardLayout>
  )
}
