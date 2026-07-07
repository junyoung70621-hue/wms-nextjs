import { getSession } from '@/lib/session'
import { GUEST_VIEWER } from '@/lib/guestViewer'
import WarehouseContent from './WarehouseContent'

export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getSession()
  const { tab } = await searchParams
  // 둘러보기 모드: 실제 화면을 렌더하고 데이터 글자만 블러(guest-veil)
  if (!session.user) return <WarehouseContent user={GUEST_VIEWER} initialTab={tab} />

  return <WarehouseContent user={session.user} initialTab={tab} />
}
