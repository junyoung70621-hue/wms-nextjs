import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import TerminalContent from '../TerminalContent'

export default async function TaxiTerminalPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return (
    <DashboardLayout user={session.user} title="택시단말기 현황">
      <TerminalContent type="taxi" user={session.user} />
    </DashboardLayout>
  )
}
