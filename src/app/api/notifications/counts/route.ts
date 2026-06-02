import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const u = session.user
  const isAdmin     = u.role === 'admin'
  const isMaterials = u.role === 'materials'
  const isManager   = u.role === 'manager'
  const isManager2  = isAdmin || isMaterials
  const userCenter  = u.assigned_center ?? u.center

  // 대기 자재요청
  let matQ = supabase
    .from('material_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (!isManager2) matQ = matQ.eq('from_center', userCenter)

  // 대기 구매요청
  let purQ = supabase
    .from('purchase_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (!isManager2) purQ = purQ.eq('requester_id', u.id)

  // 대기 이동신청
  let trQ = supabase
    .from('transfers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (isMaterials) {
    trQ = trQ.or(`from_center.eq.자재센터,to_center.eq.자재센터`)
  } else if (isManager) {
    trQ = trQ.or(`from_center.eq.${userCenter},to_center.eq.${userCenter}`)
  } else if (!isAdmin) {
    trQ = trQ.eq('requester_id', u.id)
  }

  // 활성 공지
  const noticesQ = supabase
    .from('notices')
    .select('id')
    .eq('is_active', true)

  // 모든 카운트 쿼리 병렬 실행
  const [
    { count: matPending },
    { count: purPending },
    { count: trPending },
    { data: notices },
  ] = await Promise.all([matQ, purQ, trQ, noticesQ])

  // 미읽은 공지 (활성 공지가 있을 때만 읽음 기록 조회)
  let unreadNotices = 0
  if (notices?.length) {
    const ids = notices.map(n => n.id)
    const { data: read } = await supabase
      .from('notice_reads')
      .select('notice_id')
      .eq('user_id', u.id)
      .in('notice_id', ids)

    const readSet = new Set((read ?? []).map(r => r.notice_id))
    unreadNotices = ids.filter(id => !readSet.has(id)).length
  }

  return NextResponse.json({
    mat_pending:     matPending   ?? 0,
    pur_pending:     purPending   ?? 0,
    tr_pending:      trPending    ?? 0,
    unread_notices:  unreadNotices,
  })
}
