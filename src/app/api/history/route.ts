import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { GUEST_VIEWER, maskActorNames } from '@/lib/guestViewer'

export async function GET(request: Request) {
  const session = await getSession()
  // 둘러보기 모드: 익명 읽기 허용 (처리자 이름은 마스킹, 열람 범위는 게스트 뷰어 센터로 제한)
  const anonymous = !session.user
  const u = session.user ?? GUEST_VIEWER
  const isManager = u.role === 'admin' || u.role === 'materials'
  const userCenter = u.assigned_center ?? u.center

  const { searchParams } = new URL(request.url)
  const actionType = searchParams.get('action')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200'), 1000)

  const dateFrom = searchParams.get('date_from') // YYYY-MM-DD
  const dateTo   = searchParams.get('date_to')   // YYYY-MM-DD

  let query = supabase
    .from('history')
    .select(
      'id, action_type, quantity, reason, from_center, to_center, ' +
      'snapshot_qty_before, snapshot_qty_after, acted_at, ' +
      'warehouse(item_name, location), users(name)'
    )
    .order('acted_at', { ascending: false })
    .limit(limit)

  if (actionType) {
    query = query.eq('action_type', actionType)
  }
  // 센터 스코핑: 관리자·자재파트 외에는 본인 센터 관련 이력만 (대시보드와 동일 기준)
  if (!isManager) {
    query = query.or(`from_center.eq.${userCenter},to_center.eq.${userCenter}`)
  }
  if (dateFrom) {
    query = query.gte('acted_at', `${dateFrom}T00:00:00+09:00`)
  }
  if (dateTo) {
    query = query.lte('acted_at', `${dateTo}T23:59:59+09:00`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: anonymous ? maskActorNames(data ?? []) : (data ?? []) })
}
