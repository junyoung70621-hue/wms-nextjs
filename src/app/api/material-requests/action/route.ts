import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { sendMail, emailLayout, infoTable, noteBanner, MAIL_COLOR, type Cell } from '@/lib/email'
import { firePush, sendPushToUsers } from '@/lib/push'
import { adjustStock } from '@/lib/stock'

const ACTION_LABEL: Record<string, string> = { approved: '승인', rejected: '거절', on_hold: '보류' }

// ── 승인/거절/보류 처리 (admin/materials) ────────────────────────────────
export async function POST(request: Request) {
  const session = await getSession()
  const role = session.user?.role
  if (!session.user || (role !== 'admin' && role !== 'materials')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { id, action, replyMessage, allocations } = await request.json()
  // action: 'approved' | 'rejected' | 'on_hold' | 'pending'
  // allocations: [{ item_name, warehouse_id, quantity }] — 승인 시 박스별 차감 수량(여러 박스 분할 가능)
  if (!id || !action) return NextResponse.json({ error: '필수값 누락' }, { status: 400 })
  if (!['approved', 'rejected', 'on_hold', 'pending'].includes(action)) {
    return NextResponse.json({ error: '허용되지 않는 action' }, { status: 400 })
  }

  // 조건부 전환: 대기/보류 상태에서만 처리 가능 → 이중 승인(이중 차감) 차단
  const { data: updatedRows, error } = await supabase.from('material_requests').update({
    status:       action,
    processed_at: new Date().toISOString(),
    processed_by: session.user.id,
    ...(replyMessage ? { reply_message: replyMessage } : {}),
  }).eq('id', id).in('status', ['pending', 'on_hold']).select('*')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updatedRows?.length) {
    return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 409 })
  }

  // 승인 시 재고 차감
  if (action === 'approved') {
    const req = updatedRows[0]

    if (req) {
      const items = req.items ?? []
      const approver_id = session.user.id
      const from_center = req.from_center

      // 차감 배분: allocations(박스별 수량) 있으면 그대로, 없으면 자동(재고 많은 박스부터 그리디 분할)
      type Alloc = { item_name: string; warehouse_id: number; quantity: number }
      let allocs: Alloc[] = []
      if (Array.isArray(allocations) && allocations.length) {
        allocs = (allocations as Alloc[]).filter(a => a.warehouse_id && a.quantity > 0)
      } else {
        for (const item of items) {
          let need = parseInt(item.requested_qty) || 0
          if (need <= 0) continue
          const { data: boxes } = await supabase
            .from('warehouse').select('id, quantity')
            .eq('item_name', item.item_name).eq('location', '자재센터')
            .order('quantity', { ascending: false })
          for (const b of boxes ?? []) {
            if (need <= 0) break
            const take = Math.min(need, b.quantity)
            if (take > 0) { allocs.push({ item_name: item.item_name, warehouse_id: b.id, quantity: take }); need -= take }
          }
        }
      }

      // 박스별 차감 + 이력 (여러 박스에서 나눠 차감, 자재센터 박스만 허용)
      const deductedByItem = new Map<string, number>()
      for (const a of allocs) {
        const { data: src } = await supabase
          .from('warehouse').select('location').eq('id', a.warehouse_id).single()
        if (!src || src.location !== '자재센터') continue
        const r = await adjustStock(a.warehouse_id, -a.quantity, {
          last_modified_by: approver_id, last_modified_at: new Date().toISOString(),
        })
        if (!r.ok) continue
        await supabase.from('history').insert({
          actor_id: approver_id, item_id: a.warehouse_id, action_type: 'transfer',
          quantity: a.quantity, reason: `자재 요청 승인 (${from_center})`,
          from_center: '자재센터', to_center: from_center,
          snapshot_qty_before: r.before, snapshot_qty_after: r.after,
        })
        deductedByItem.set(a.item_name, (deductedByItem.get(a.item_name) ?? 0) + a.quantity)
      }

      // 요청 센터 재고 증가 (item_name 별 차감 합계, 행 없으면 신규 등록)
      for (const [item_name, qty] of deductedByItem) {
        const { data: dstList } = await supabase
          .from('warehouse').select('id')
          .eq('item_name', item_name).eq('location', from_center)
          .order('quantity', { ascending: false }).limit(1)
        if (dstList?.length) {
          const dst = dstList[0]
          const r = await adjustStock(dst.id, qty, {
            last_modified_by: approver_id, last_modified_at: new Date().toISOString(),
          })
          if (!r.ok) continue
          await supabase.from('history').insert({
            actor_id: approver_id, item_id: dst.id, action_type: 'transfer',
            quantity: qty, reason: `자재 요청 승인 (${from_center})`,
            from_center: '자재센터', to_center: from_center,
            snapshot_qty_before: r.before, snapshot_qty_after: r.after,
          })
        } else {
          // 요청 센터에 해당 자재 행이 없으면 신규 등록 (차감분 증발 방지)
          const { data: ins } = await supabase.from('warehouse').insert({
            item_name, quantity: qty, location: from_center, last_modified_by: approver_id,
          }).select('id').single()
          if (ins) {
            await supabase.from('history').insert({
              actor_id: approver_id, item_id: ins.id, action_type: 'transfer',
              quantity: qty, reason: `자재 요청 승인 (${from_center})`,
              from_center: '자재센터', to_center: from_center,
              snapshot_qty_before: 0, snapshot_qty_after: qty,
            })
          }
        }
      }
    }
  }

  // 승인/거절 시 신청자에게 이메일
  if (['approved', 'rejected', 'on_hold'].includes(action)) {
    try {
      const { data: req } = await supabase
        .from('material_requests')
        .select('requester_id, requester_name, from_center, items')
        .eq('id', id).single()

      if (req?.requester_id) {
        firePush(sendPushToUsers([req.requester_id], {
          title: `자재요청 ${ACTION_LABEL[action] ?? action}`,
          body: `${req.from_center} 자재요청이 ${ACTION_LABEL[action] ?? action} 처리되었습니다.`,
          url: '/material-requests',
          tag: `material-request-${id}`,
        }))
      }

      if (req?.requester_id) {
        const { data: reqUser } = await supabase
          .from('users').select('email').eq('id', req.requester_id).single()

        if (reqUser?.email) {
          const STATUS: Record<string, { label: string; color: string }> = {
            approved: { label: '승인', color: MAIL_COLOR.success },
            rejected: { label: '거절', color: MAIL_COLOR.danger },
            on_hold:  { label: '보류', color: MAIL_COLOR.pending },
          }
          const st = STATUS[action] ?? { label: action, color: MAIL_COLOR.text }
          const itemRows: Cell[][] = (req.items ?? []).map((it: Record<string, unknown>, i: number) =>
            [String(i + 1), String(it['item_name'] ?? ''), { text: String(it['requested_qty'] ?? ''), right: true }])

          await sendMail(
            reqUser.email,
            `[에이텍모빌리티 자재관리] 자재요청 ${st.label} · ${req.requester_name}님`,
            emailLayout({
              title: `자재 요청이 ${st.label} 처리되었습니다`,
              greetingName: req.requester_name,
              bodyHtml: `
                <p>요청하신 자재 건이 <b style="color:${st.color};">${st.label}</b> 처리되었습니다.</p>
                ${infoTable(['항목', '내용'], [
                  ['요청자', `${req.requester_name} (${req.from_center})`],
                  ['처리결과', { text: st.label, color: st.color, bold: true }],
                ])}
                <p style="margin:8px 0 0; font-weight:700; color:#1E293B;">요청 품목</p>
                ${infoTable(['No', '자재명', '요청수량'], itemRows)}
                ${replyMessage ? noteBanner(replyMessage) : ''}`,
            }),
          )
        }
      }
    } catch { /* 메일 실패 무시 */ }
  }

  return NextResponse.json({ ok: true })
}
