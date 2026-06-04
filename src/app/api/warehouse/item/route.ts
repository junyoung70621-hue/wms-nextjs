import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

// GET: 자재 이력 조회
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const item_id = searchParams.get('item_id')
  if (!item_id) return NextResponse.json({ error: 'item_id 필요' }, { status: 400 })

  const u = session.user
  const center = u.assigned_center ?? u.center

  let query = supabase
    .from('history')
    .select('id, action_type, quantity, reason, from_center, to_center, snapshot_qty_before, snapshot_qty_after, acted_at, actor:users!actor_id(name)')
    .eq('item_id', item_id)
    .order('acted_at', { ascending: false })
    .limit(50)

  // admin/materials: 전체 이력, 나머지: 본인 센터 관련만
  if (u.role !== 'admin' && u.role !== 'materials') {
    query = query.or(`from_center.eq.${center},to_center.eq.${center}`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// 수정 권한: 관리자 / 자재센터 직원(자재파트 포함, guest 제외)
function canEditItem(user: { role: string; center: string; assigned_center: string | null }) {
  const center = user.assigned_center ?? user.center
  return user.role === 'admin' || (center === '자재센터' && user.role !== 'guest')
}

// PATCH: 자재 정보 수정 (admin / 자재센터 직원)
export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session.user || !canEditItem(session.user)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { id, reason, ...fields } = await request.json()
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const allowed = new Set([
    'item_name', 'quantity', 'rack_no', 'shelf', 'box_no',
    'category_large', 'category_mid', 'category_small',
    'location', 'erp_name', 'erp_code', 'notes', 'repair_manager', 'item_location',
  ])
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.has(k)) update[k] = v
  }
  update.last_modified_by = session.user.id
  update.last_modified_at = new Date().toISOString()

  // 수량 변경 전 현재 재고 조회
  const { data: before } = await supabase
    .from('warehouse').select('quantity, location').eq('id', id).single()

  const { error } = await supabase.from('warehouse').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 이력 기록: 수량이 늘면 입고(in), 줄면 출고(out), 수량 변화 없으면 정보 수정(edit)
  const beforeQty = before?.quantity ?? 0
  const afterQty  = update.quantity !== undefined ? Number(update.quantity) : beforeQty
  const delta     = afterQty - beforeQty
  const itemCenter = (update.location as string | undefined) ?? before?.location ?? null
  const reasonText = (typeof reason === 'string' && reason.trim())
    || (delta > 0 ? '수량 증가' : delta < 0 ? '수량 감소' : '정보 수정')

  await supabase.from('history').insert({
    actor_id:             session.user.id,
    item_id:              id,
    action_type:          delta > 0 ? 'in' : delta < 0 ? 'out' : 'edit',
    // 입·출고는 변동량(절대값), 정보 수정은 현재 수량 기록
    quantity:             delta !== 0 ? Math.abs(delta) : afterQty,
    reason:               reasonText,
    // 입고는 들어온 센터(to), 출고는 빠진 센터(from)
    from_center:          delta < 0 ? itemCenter : null,
    to_center:            delta > 0 ? itemCenter : null,
    snapshot_qty_before:  beforeQty,
    snapshot_qty_after:   afterQty,
  })

  return NextResponse.json({ ok: true })
}
