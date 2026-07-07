import { getSession } from '@/lib/session'
import { GUEST_VIEWER } from '@/lib/guestViewer'
import TaxiTerminalContent from '../TaxiTerminalContent'

export default async function TaxiTerminalPage() {
  const session = await getSession()
  // 둘러보기 모드: 실제 화면을 렌더하고 데이터 글자만 블러(guest-veil)
  if (!session.user) return <TaxiTerminalContent user={GUEST_VIEWER} />

  return <TaxiTerminalContent user={session.user} />
}
