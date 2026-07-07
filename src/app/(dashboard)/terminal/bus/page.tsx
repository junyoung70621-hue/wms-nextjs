import { getSession } from '@/lib/session'
import { GUEST_VIEWER } from '@/lib/guestViewer'
import BusTerminalContent from '../BusTerminalContent'

export default async function BusTerminalPage() {
  const session = await getSession()
  // 둘러보기 모드: 실제 화면을 렌더하고 데이터 글자만 블러(guest-veil)
  if (!session.user) return <BusTerminalContent user={GUEST_VIEWER} />

  return <BusTerminalContent user={session.user} />
}
