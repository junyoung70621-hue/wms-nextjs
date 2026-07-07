import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { GUEST_VIEWER } from '@/lib/guestViewer'
import UsageContent from './UsageContent'

export default async function UsagePage() {
  const session = await getSession()
  // 둘러보기 모드: 실제 화면을 렌더하고 데이터 글자만 블러(guest-veil)
  if (!session.user) return <UsageContent user={GUEST_VIEWER} />
  if (session.user.role === 'guest') redirect('/dashboard')

  return <UsageContent user={session.user} />
}
