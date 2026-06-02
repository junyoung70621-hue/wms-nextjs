import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import WarehouseContent from './WarehouseContent'

export default async function WarehousePage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <WarehouseContent user={session.user} />
}
