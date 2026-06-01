import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

// PATCH: 이동 신청 승인 / 거절 / 취소
export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const u    = session.user
  const role = u.role
  const center = u.assigned_center ?? u.center

  const { id, action } = await request.json() // action: 'approved' | 'rejected' | 'cancelled'
  if (!id || !action) return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })

  // 이동 신청 정보 조회
  const { data: tr, error: trErr } = await supabase
    .from('transfers')
    .select('id, from_center, to_center, quantity, status, requester_id, item_id')
    .eq('id', id)
    .single()

  if (trErr || !tr) return NextResponse.json({ error: '이동 신청을 찾을 수 없습니다.' }, { status: 404 })
  if (tr.status !== 'pending') return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 400 })

  // 취소: 본인만
  if (action === 'cancelled') {
    if (tr.requester_id !== u.id && role !== 'admin') {
      return NextResponse.json({ error: '취소 권한 없음' }, { status: 403 })
    }
    const { error } = await supabase.from('transfers').update({
      status: 'cancelled',
      processed_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // 승인/거절 권한 체크
  if (!['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ error: '잘못된 액션' }, { status: 400 })
  }

  const canApprove = (() => {
    if (role === 'admin') return true
    if (role === 'materials') return tr.to_center === '자재센터' || tr.from_center === '자재센터'
    if (role === 'manager') return tr.to_center === center
    return false
  })()
  if (!canApprove) return NextResponse.json({ error: '승인 권한 없음' }, { status: 403 })

  if (action === 'rejected') {
    const { error } = await supabase.from('transfers').update({
      status: 'rejected',
      processed_at: new Date().toISOString(),
      approver_id: u.id,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // 승인: 재고 이동 처리
  const { data: item, error: itemErr } = await supabase
    .from('warehouse')
    .select('id, quantity, location')
    .eq('id', tr.item_id)
    .single()

  if (itemErr || !item) return NextResponse.json({ error: '자재를 찾을 수 없습니다.' }, { status: 404 })
  if (item.quantity < tr.quantity) {
    return NextResponse.json({ error: `재고 부족 (현재: ${item.quantity}개, 요청: ${tr.quantity}개)` }, { status: 400 })
  }

  const newFromQty = item.quantity - tr.quantity

  // from_center 수량 차감
  const { error: deductErr } = await supabase
    .from('warehouse')
    .update({ quantity: newFromQty, last_modified_at: new Date().toISOString() })
    .eq('id', tr.item_id)

  if (deductErr) return NextResponse.json({ error: deductErr.message }, { status: 500 })

  // to_center 동일 자재 존재 여부 확인 (item_name 매칭)
  const { data: fromItem } = await supabase
    .from('warehouse').select('item_name, erp_code').eq('id', tr.item_id).single()

  if (fromItem) {
    const { data: toItem } = await supabase
      .from('warehouse')
      .select('id, quantity')
      .eq('location', tr.to_center)
      .eq('item_name', fromItem.item_name)
      .maybeSingle()

    if (toItem) {
      await supabase.from('warehouse').update({
        quantity: toItem.quantity + tr.quantity,
        last_modified_at: new Date().toISOString(),
      }).eq('id', toItem.id)
    } else {
      // to_center에 신규 등록
      await supabase.from('warehouse').insert({
        item_name: fromItem.item_name,
        erp_code: fromItem.erp_code,
        quantity: tr.quantity,
        location: tr.to_center,
        last_modified_by: u.id,
      })
    }
  }

  // 이력 기록
  await supabase.from('history').insert([
    {
      actor_id: u.id,
      item_id: tr.item_id,
      action_type: 'transfer',
      quantity: tr.quantity,
      reason: `이동 승인 → ${tr.to_center}`,
      from_center: tr.from_center,
      to_center: tr.to_center,
      snapshot_qty_before: item.quantity,
      snapshot_qty_after: newFromQty,
    },
  ])

  // 이동 신청 상태 업데이트
  const { error: updateErr } = await supabase.from('transfers').update({
    status: 'approved',
    processed_at: new Date().toISOString(),
    approver_id: u.id,
  }).eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
