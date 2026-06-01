import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import WarehouseContent from './WarehouseContent'

export default async function WarehousePage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return (
    <DashboardLayout user={session.user!} title="재고 현황">
      <WarehouseContent user={session.user!} />
    </DashboardLayout>
  )
}
