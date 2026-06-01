import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

// ── 승인/거절/보류 처리 (admin/materials) ────────────────────────────────
export async function POST(request: Request) {
  const session = await getSession()
  const role = session.user?.role
  if (!session.user || (role !== 'admin' && role !== 'materials')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { id, action, replyMessage } = await request.json()
  // action: 'approved' | 'rejected' | 'on_hold' | 'pending'
  if (!id || !action) return NextResponse.json({ error: '필수값 누락' }, { status: 400 })

  const { error } = await supabase.from('material_requests').update({
    status:       action,
    processed_at: new Date().toISOString(),
    processed_by: session.user.id,
    ...(replyMessage ? { reply_message: replyMessage } : {}),
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 승인 시 재고 차감은 복잡해서 간략 처리 (기존 Streamlit 로직과 동일하게 추후 상세 구현 가능)
  if (action === 'approved') {
    // 자재 요청 정보 조회
    const { data: req } = await supabase
      .from('material_requests').select('*').eq('id', id).single()

    if (req) {
      const items = req.items ?? []
      const approver_id = session.user.id
      const from_center = req.from_center

      for (const item of items) {
        const item_name = item.item_name
        const req_qty   = parseInt(item.requested_qty) || 0

        // 자재센터에서 차감
        const { data: srcList } = await supabase
          .from('warehouse').select('id, quantity')
          .eq('item_name', item_name).eq('location', '자재센터')
          .order('quantity', { ascending: false }).limit(1)

        if (!srcList?.length || srcList[0].quantity < req_qty) continue

        const src = srcList[0]
        const newQty = src.quantity - req_qty

        await supabase.from('warehouse').update({
          quantity: newQty, last_modified_by: approver_id, last_modified_at: 'now()',
        }).eq('id', src.id)

        // 이력 기록
        await supabase.from('history').insert({
          actor_id: approver_id, item_id: src.id, action_type: 'transfer',
          quantity: req_qty, reason: `자재 요청 승인 (${from_center})`,
          from_center: '자재센터', to_center: from_center,
          snapshot_qty_before: src.quantity, snapshot_qty_after: newQty,
        })

        // 요청 센터 증가
        const { data: dstList } = await supabase
          .from('warehouse').select('id, quantity')
          .eq('item_name', item_name).eq('location', from_center)
          .order('quantity', { ascending: false }).limit(1)

        if (dstList?.length) {
          const dst = dstList[0]
          const dstNew = dst.quantity + req_qty
          await supabase.from('warehouse').update({
            quantity: dstNew, last_modified_by: approver_id, last_modified_at: 'now()',
          }).eq('id', dst.id)
          await supabase.from('history').insert({
            actor_id: approver_id, item_id: dst.id, action_type: 'transfer',
            quantity: req_qty, reason: `자재 요청 승인 (${from_center})`,
            from_center: '자재센터', to_center: from_center,
            snapshot_qty_before: dst.quantity, snapshot_qty_after: dstNew,
          })
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
