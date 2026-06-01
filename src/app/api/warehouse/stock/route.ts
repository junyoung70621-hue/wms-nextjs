import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

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
    if (!item_id || quantity < 1) continue

    const { data: item } = await supabase
      .from('warehouse').select('id, item_name, quantity, location').eq('id', item_id).single()
    if (!item) { errors.push(`ID ${item_id}: 자재 없음`); continue }

    // 자재센터만 직접 입출고 (admin은 모든 센터)
    if (role === 'materials' && item.location !== '자재센터') {
      errors.push(`${item.item_name}: 자재파트는 자재센터만 입출고 가능`); continue
    }

    const before = item.quantity ?? 0
    let after: number

    if (action === 'in') {
      after = before + quantity
    } else {
      if (before < quantity) {
        errors.push(`${item.item_name}: 재고 부족 (현재 ${before}개)`); continue
      }
      after = before - quantity
    }

    await supabase.from('warehouse').update({
      quantity: after,
      last_modified_by: u.id,
      last_modified_at: new Date().toISOString(),
    }).eq('id', item_id)

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
