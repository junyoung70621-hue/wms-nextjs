import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/layout/DashboardLayout'

// 접속현황(last_seen_at) 갱신 throttle — 같은 유저는 일정 간격으로만 기록 (wms_V2 공유 컬럼)
const SEEN_THROTTLE_MS = 60 * 1000
const lastSeenWrite = new Map<string, number>()
function touchLastSeen(userId: string) {
  const now = Date.now()
  const prev = lastSeenWrite.get(userId) ?? 0
  if (now - prev < SEEN_THROTTLE_MS) return
  lastSeenWrite.set(userId, now)
  // 페이지 렌더를 막지 않도록 fire-and-forget
  supabase.from('users').update({ last_seen_at: new Date(now).toISOString() }).eq('id', userId)
    .then(() => {}, () => {})
}

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session.user) {
    const path = (await headers()).get('x-pathname') ?? ''
    // 안전한 내부 경로만 next로 보존 (오픈 리다이렉트 방지)
    const safe = path.startsWith('/') && !path.startsWith('//') ? path : ''
    redirect(safe && safe !== '/dashboard' ? `/login?next=${encodeURIComponent(safe)}` : '/login')
  }

  // 마지막 접속 시각 갱신 (wms_V2 접속현황과 동일 기준)
  touchLastSeen(session.user.id)

  return <DashboardLayout user={session.user}>{children}</DashboardLayout>
}
