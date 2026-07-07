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

  // 비로그인도 셸(사이드바+탑바)은 보여준다 — 게스트 미리보기 모드
  if (session.user) {
    // 마지막 접속 시각 갱신 (wms_V2 접속현황과 동일 기준)
    touchLastSeen(session.user.id)
  }

  return <DashboardLayout user={session.user ?? null}>{children}</DashboardLayout>
}
