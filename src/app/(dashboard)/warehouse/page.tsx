import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import WarehouseContent from './WarehouseContent'

export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getSession()
  if (!session.user) redirect('/login')

  const { tab } = await searchParams
  return <WarehouseContent user={session.user} initialTab={tab} />
}
