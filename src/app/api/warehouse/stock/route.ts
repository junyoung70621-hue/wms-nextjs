import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { adjustStock } from '@/lib/stock'

// POST: 입고 / 출고
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const u    = session.user
  const role = u.role

  if (role !== 'admin' && role !== 'materials') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { items, action, reason } = await request.json()
  // items: [{ item_id, quantity }]
  // action: 'in' | 'out'

  if (!items?.length || !action || !reason?.trim()) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
  }

  const errors: string[] = []
  const histories: Record<string, unknown>[] = []

  for (const { item_id, quantity } of items) {
    if (!item_id || !Number.isInteger(quantity) || quantity < 1) continue

    const { data: item } = await supabase
      .from('warehouse').select('id, item_name, location').eq('id', item_id).single()
    if (!item) { errors.push(`ID ${item_id}: 자재 없음`); continue }

    // 자재센터만 직접 입출고 (admin은 모든 센터)
    if (role === 'materials' && item.location !== '자재센터') {
      errors.push(`${item.item_name}: 자재파트는 자재센터만 입출고 가능`); continue
    }

    const r = await adjustStock(item_id, action === 'in' ? quantity : -quantity, {
      last_modified_by: u.id,
      last_modified_at: new Date().toISOString(),
    })
    if (!r.ok) { errors.push(`${item.item_name}: ${r.error}`); continue }
    const { before, after } = r

    histories.push({
      actor_id: u.id,
      item_id,
      action_type: action,
      quantity,
      reason: reason.trim(),
      from_center: action === 'out' ? item.location : null,
      to_center: action === 'in' ? item.location : null,
      snapshot_qty_before: before,
      snapshot_qty_after: after,
    })
  }

  if (histories.length) {
    await supabase.from('history').insert(histories)
  }

  return NextResponse.json({ ok: true, errors })
}
