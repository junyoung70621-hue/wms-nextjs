import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { NO_TAXI_TERMINAL } from '@/constants/centers'
import { GUEST_VIEWER } from '@/lib/guestViewer'
import TaxiTerminalContent from '../TaxiTerminalContent'

export default async function TaxiTerminalPage() {
  const session = await getSession()
  // 둘러보기 모드: 실제 화면을 렌더하고 데이터 글자만 블러(guest-veil)
  if (!session.user) return <TaxiTerminalContent user={GUEST_VIEWER} />

  const u = session.user
  if (u.role !== 'admin' && NO_TAXI_TERMINAL.has(u.assigned_center ?? u.center)) redirect('/dashboard')
  return <TaxiTerminalContent user={u} />
}
