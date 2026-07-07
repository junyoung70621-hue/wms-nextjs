import { getSession } from '@/lib/session'
import NoticesContent from './NoticesContent'

export default async function NoticesPage() {
  const session = await getSession()
  // 둘러보기 모드: 실제 공지 목록 렌더 (제목·본문은 guest-veil 블러)
  if (!session.user) return <NoticesContent isAdmin={false} />

  return <NoticesContent isAdmin={session.user.role === 'admin'} />
}
