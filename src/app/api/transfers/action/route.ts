import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { firePush, sendPushToUsers } from '@/lib/push'
import { adjustStock } from '@/lib/stock'

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

  // 취소: 본인만 (pending 조건부 업데이트로 동시 처리 차단)
  if (action === 'cancelled') {
    if (tr.requester_id !== u.id && role !== 'admin') {
      return NextResponse.json({ error: '취소 권한 없음' }, { status: 403 })
    }
    const { data: updated, error } = await supabase.from('transfers').update({
      status: 'cancelled',
      processed_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'pending').select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated?.length) return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 400 })
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
    const { data: updated, error } = await supabase.from('transfers').update({
      status: 'rejected',
      processed_at: new Date().toISOString(),
      approver_id: u.id,
    }).eq('id', id).eq('status', 'pending').select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated?.length) return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 400 })
    firePush(sendPushToUsers([tr.requester_id], {
      title: '이동신청 거절',
      body: `${tr.from_center}→${tr.to_center} ${tr.quantity}개 이동신청이 거절되었습니다.`,
      url: '/warehouse?tab=transfers', tag: `transfer-${id}`,
    }))
    return NextResponse.json({ ok: true })
  }

  // 승인: 원본 자재·소속 센터 확인
  const { data: item, error: itemErr } = await supabase
    .from('warehouse')
    .select('id, item_name, erp_code, location')
    .eq('id', tr.item_id)
    .single()

  if (itemErr || !item) return NextResponse.json({ error: '자재를 찾을 수 없습니다.' }, { status: 404 })
  if (item.location !== tr.from_center) {
    return NextResponse.json({ error: '자재의 소속 센터가 출발 센터와 다릅니다.' }, { status: 400 })
  }

  // 승인 선점: pending → approved 조건부 전환 (동시 승인 시 한 쪽만 통과)
  const { data: claimed, error: claimErr } = await supabase.from('transfers').update({
    status: 'approved',
    processed_at: new Date().toISOString(),
    approver_id: u.id,
  }).eq('id', id).eq('status', 'pending').select('id')
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  if (!claimed?.length) return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 400 })

  // from_center 수량 차감 (CAS, 재고 부족 시 승인 되돌림)
  const deducted = await adjustStock(tr.item_id, -tr.quantity, {
    last_modified_at: new Date().toISOString(),
  })
  if (!deducted.ok) {
    await supabase.from('transfers').update({
      status: 'pending', processed_at: null, approver_id: null,
    }).eq('id', id)
    return NextResponse.json({ error: deducted.error }, { status: 400 })
  }

  // to_center 동일 자재 존재 여부 확인 (item_name 매칭, 여러 행이면 첫 행에 합산)
  const { data: toList } = await supabase
    .from('warehouse')
    .select('id')
    .eq('location', tr.to_center)
    .eq('item_name', item.item_name)
    .order('quantity', { ascending: false })
    .limit(1)

  if (toList?.length) {
    const credited = await adjustStock(toList[0].id, tr.quantity, {
      last_modified_at: new Date().toISOString(),
    })
    if (!credited.ok) {
      // 입고 실패 → 차감 원복 후 승인 되돌림
      await adjustStock(tr.item_id, tr.quantity, {})
      await supabase.from('transfers').update({
        status: 'pending', processed_at: null, approver_id: null,
      }).eq('id', id)
      return NextResponse.json({ error: `도착 센터 입고 실패: ${credited.error}` }, { status: 500 })
    }
  } else {
    // to_center에 신규 등록
    const { error: insErr } = await supabase.from('warehouse').insert({
      item_name: item.item_name,
      erp_code: item.erp_code,
      quantity: tr.quantity,
      location: tr.to_center,
      last_modified_by: u.id,
    })
    if (insErr) {
      await adjustStock(tr.item_id, tr.quantity, {})
      await supabase.from('transfers').update({
        status: 'pending', processed_at: null, approver_id: null,
      }).eq('id', id)
      return NextResponse.json({ error: `도착 센터 등록 실패: ${insErr.message}` }, { status: 500 })
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
      snapshot_qty_before: deducted.before,
      snapshot_qty_after: deducted.after,
    },
  ])

  firePush(sendPushToUsers([tr.requester_id], {
    title: '이동신청 승인',
    body: `${tr.from_center}→${tr.to_center} ${tr.quantity}개 이동이 승인되었습니다.`,
    url: '/warehouse?tab=transfers', tag: `transfer-${id}`,
  }))
  return NextResponse.json({ ok: true })
}
