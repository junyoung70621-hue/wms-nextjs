import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { sendTeamsCard, buildRequestCard, type TeamsCell } from '@/lib/teams'
import { firePush, sendPushToRoles } from '@/lib/push'

// ── 목록 조회 ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const isManager = session.user.role === 'admin' || session.user.role === 'materials'
  const userCenter = session.user.assigned_center ?? session.user.center

  let query = supabase
    .from('material_requests')
    .select('*, processor:users!processed_by(name, center, assigned_center)')
    .order('requested_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (!isManager) query = query.eq('from_center', userCenter)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── 신규 자재요청 등록 ────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const u = session.user
  if (u.role === 'guest') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { items, notes } = await request.json()
  // items: [{ item_name, current_qty, requested_qty }]
  if (!items?.length) {
    return NextResponse.json({ error: '자재를 1개 이상 선택하세요.' }, { status: 400 })
  }

  const fromCenter = u.assigned_center ?? u.center
  const { error } = await supabase.from('material_requests').insert({
    requester_id:    u.id,
    requester_name:  u.name,
    requester_email: u.email,
    from_center:     fromCenter,
    items,
    notes: notes?.trim() || null,
    status: 'pending',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  firePush(sendPushToRoles(['admin', 'materials'], {
    title: '새 자재요청',
    body: `${u.name}(${fromCenter}) · 자재 ${items.length}건 요청`,
    url: '/material-requests?tab=pending',
    tag: 'material-request',
  }))

  // Teams 알림 (자재요청·구매요청 채널)
  const who = `${u.name} (${fromCenter})`
  const itemRows: TeamsCell[][] = (items as Record<string, unknown>[]).map((it, i) => [
    i + 1,
    String(it['item_name'] ?? ''),
    it['erp_code'] ? String(it['erp_code']) : { text: '미등록', color: 'Attention', bold: true },
    String(it['current_qty'] ?? ''),
    { text: String(it['requested_qty'] ?? ''), bold: true },
  ])
  await sendTeamsCard(buildRequestCard({
    title: '📦 자재 요청 접수',
    subtitle: `${who} · 품목 ${items.length}건`,
    facts: [['요청자', who], ...(notes?.trim() ? [['요청메모', String(notes).trim()] as [string, string]] : [])],
    tableHeaders: ['No', '자재명', 'ERP코드', '현재재고', '요청수량'],
    tableRows: itemRows,
  }))

  return NextResponse.json({ ok: true })
}

// ── 취소 (센터 사용자) ────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { id, status } = await request.json()
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  // 이 라우트는 본인 취소 전용. 승인/거절은 action 라우트(admin/materials)에서만.
  if (status !== 'cancelled') return NextResponse.json({ error: '허용되지 않는 상태' }, { status: 400 })

  const { data: reqRow } = await supabase
    .from('material_requests').select('requester_id').eq('id', id).single()
  if (!reqRow) return NextResponse.json({ error: '요청 없음' }, { status: 404 })
  if (reqRow.requester_id !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: '본인 요청만 취소할 수 있습니다.' }, { status: 403 })
  }

  const { data: updated, error } = await supabase
    .from('material_requests')
    .update({ status: 'cancelled', processed_at: new Date().toISOString(), processed_by: session.user.id })
    .eq('id', id)
    .in('status', ['pending', 'on_hold'])
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

// ── 삭제 (admin) ──────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  const { id } = await request.json()
  const { error } = await supabase.from('material_requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
