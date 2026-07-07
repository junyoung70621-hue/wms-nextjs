import { getSession } from '@/lib/session'
import { GUEST_VIEWER } from '@/lib/guestViewer'
import DashboardContent from './DashboardContent'

export default async function DashboardPage() {
  const session = await getSession()
  // 둘러보기 모드: 실제 화면을 렌더하고 데이터 글자만 블러(guest-veil)
  if (!session.user) return <DashboardContent user={GUEST_VIEWER} />

  return <DashboardContent user={session.user} />
}
