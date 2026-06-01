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

// PATCH: 자재 정보 수정 (admin 전용)
export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { id, ...fields } = await request.json()
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

  const { error } = await supabase.from('warehouse').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
