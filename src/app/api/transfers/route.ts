import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { firePush, sendPushToUsers } from '@/lib/push'

// ── GET: 이동 신청 목록 ───────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // pending | approved | rejected | null=전체

  const u    = session.user
  const role = u.role
  const center = u.assigned_center ?? u.center

  let query = supabase
    .from('transfers')
    .select(`
      id, from_center, to_center, quantity, status, requested_at, processed_at,
      requester:users!requester_id(id, name, center, assigned_center),
      approver:users!approver_id(name, center, assigned_center),
      warehouse:warehouse!item_id(id, item_name, quantity, location)
    `)
    .order('requested_at', { ascending: false })

  if (status) query = query.eq('status', status)

  // 역할별 필터
  if (role === 'materials') {
    query = query.or(`from_center.eq.자재센터,to_center.eq.자재센터`)
  } else if (role === 'manager') {
    query = query.or(`from_center.eq.${center},to_center.eq.${center}`)
  } else if (role === 'user') {
    query = query.eq('requester_id', u.id)
  }
  // admin: 전체

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── POST: 이동 신청 ───────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const u    = session.user
  const role = u.role
  if (role === 'guest') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { item_id, from_center, to_center, quantity } = await request.json()
  if (!item_id || !from_center || !to_center || !quantity) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
  }
  if (quantity < 1) return NextResponse.json({ error: '수량은 1 이상이어야 합니다.' }, { status: 400 })

  // 출발 센터 권한 체크
  const center = u.assigned_center ?? u.center
  if (role !== 'admin' && role !== 'materials' && from_center !== center) {
    return NextResponse.json({ error: '본인 소속 센터에서만 이동 신청 가능합니다.' }, { status: 403 })
  }
  if (role === 'materials' && from_center !== '자재센터') {
    return NextResponse.json({ error: '자재파트는 자재센터에서만 신청 가능합니다.' }, { status: 403 })
  }

  // 현재 재고 확인
  const { data: item } = await supabase
    .from('warehouse').select('quantity, item_name').eq('id', item_id).single()
  if (!item) return NextResponse.json({ error: '자재를 찾을 수 없습니다.' }, { status: 404 })
  if (item.quantity < quantity) {
    return NextResponse.json({ error: `재고 부족 (현재: ${item.quantity}개)` }, { status: 400 })
  }

  const { error } = await supabase.from('transfers').insert({
    requester_id: u.id,
    item_id,
    from_center,
    to_center,
    quantity,
    status: 'pending',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 승인 권한자(관리자 + 도착센터 센터장)에게 푸시
  firePush((async () => {
    const { data: appr } = await supabase.from('users')
      .select('id, role, center, assigned_center').eq('is_approved', true)
    const ids = (appr ?? [])
      .filter((x: { role: string; center: string; assigned_center: string | null }) =>
        x.role === 'admin' || (x.role === 'manager' && (x.assigned_center ?? x.center) === to_center))
      .map((x: { id: string }) => x.id)
    await sendPushToUsers(ids, {
      title: '새 이동신청',
      body: `${u.name}: ${item.item_name} ${quantity}개 (${from_center}→${to_center})`,
      url: '/warehouse?tab=transfers',
      tag: 'transfer-request',
    })
  })())
  return NextResponse.json({ ok: true })
}
