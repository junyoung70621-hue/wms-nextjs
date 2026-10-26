import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { sendTeamsCard, buildRequestCard, type TeamsCell, type TeamsColor } from '@/lib/teams'
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

  // 승인 배분 사전 검증 (상태 변경 전에 — 실패 시 요청이 '승인'으로 굳지 않도록)
  type Alloc = { item_name: string; warehouse_id: number; quantity: number }
  let givenAllocs: Alloc[] | null = null
  if (action === 'approved' && Array.isArray(allocations)) {
    givenAllocs = (allocations as Alloc[])
      .filter(a => a.warehouse_id && Number(a.quantity) > 0)
      .map(a => ({ ...a, quantity: Math.floor(Number(a.quantity)) }))
    if (!givenAllocs.length) return NextResponse.json({ error: '승인할 품목이 없습니다.' }, { status: 400 })
    const { data: cur } = await supabase.from('material_requests').select('items').eq('id', id).single()
    const reqQty = new Map<string, number>((cur?.items ?? []).map((it: Record<string, unknown>) =>
      [String(it['item_name']), parseInt(String(it['requested_qty'])) || 0]))
    const sum = new Map<string, number>()
    for (const a of givenAllocs) sum.set(a.item_name, (sum.get(a.item_name) ?? 0) + a.quantity)
    for (const [name, q] of sum) {
      if (!reqQty.has(name)) return NextResponse.json({ error: `요청에 없는 품목: ${name}` }, { status: 400 })
      if (q > reqQty.get(name)!) return NextResponse.json({ error: `${name} 승인수량(${q})이 요청수량(${reqQty.get(name)})을 초과합니다.` }, { status: 400 })
    }
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

  const warnings: string[] = []

  // 승인 시 재고 차감
  if (action === 'approved') {
    const req = updatedRows[0]

    if (req) {
      const items = req.items ?? []
      const approver_id = session.user.id
      const from_center = req.from_center

      // 차감 배분: allocations(박스별 수량) 있으면 그대로, 없으면 자동(재고 많은 박스부터 그리디 분할)
      let allocs: Alloc[] = []
      if (givenAllocs) {
        allocs = givenAllocs
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
      const intendedByItem = new Map<string, number>() // 승인자가 지정한 수량 (차감 실패와 구분)
      for (const a of allocs) intendedByItem.set(a.item_name, (intendedByItem.get(a.item_name) ?? 0) + a.quantity)
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

      // 승인수량 기록 = 승인자가 지정한 수량 (0 = 제외). 차감 실패분은 별도 경고로 반환
      await supabase.from('material_requests').update({
        items: items.map((it: Record<string, unknown>) => ({
          ...it, approved_qty: intendedByItem.get(String(it['item_name'])) ?? 0,
        })),
      }).eq('id', id)
      for (const [name, want] of intendedByItem) {
        const got = deductedByItem.get(name) ?? 0
        if (got < want) warnings.push(`${name}: 승인 ${want} 중 ${got}만 차감됨 (재고 변동/박스 오류)`)
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

  // 승인/거절/보류 시 푸시 + 회신 (자재센터 요청자 → Teams, 그 외 센터 → 메일)
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

      if (req) {
        const STATUS: Record<string, { label: string; color: TeamsColor; mail: string }> = {
          approved: { label: '승인', color: 'Good',      mail: MAIL_COLOR.success },
          rejected: { label: '거절', color: 'Attention', mail: MAIL_COLOR.danger },
          on_hold:  { label: '보류', color: 'Warning',   mail: MAIL_COLOR.pending },
        }
        const st = STATUS[action] ?? { label: action, color: 'Default' as TeamsColor, mail: MAIL_COLOR.text }
        const who = `${req.requester_name} (${req.from_center})`
        const itemHead = action === 'approved' ? ['No', '자재명', '요청수량', '승인수량'] : ['No', '자재명', '요청수량']
        const approvedOf = (it: Record<string, unknown>) => Number(it['approved_qty'] ?? it['requested_qty'])
        const items: Record<string, unknown>[] = req.items ?? []

        if (req.from_center === '자재센터') {
          const itemRows: TeamsCell[][] = items.map((it, i) => {
            const row: TeamsCell[] = [i + 1, String(it['item_name'] ?? ''), String(it['requested_qty'] ?? '')]
            if (action === 'approved') {
              const a = approvedOf(it)
              row.push(a === 0
                ? { text: '제외', color: 'Attention', bold: true }
                : { text: String(a), color: a !== Number(it['requested_qty']) ? 'Warning' : 'Good', bold: true })
            }
            return row
          })
          await sendTeamsCard(buildRequestCard({
            title: `📦 자재 요청 ${st.label}`,
            color: st.color,
            subtitle: who,
            facts: [['요청자', who], ['처리결과', st.label], ['처리자', session.user.name]],
            tableHeaders: itemHead,
            tableRows: itemRows,
            note: replyMessage ? `💬 ${replyMessage}` : undefined,
          }))
        } else {
          const { data: reqUser } = await supabase
            .from('users').select('email').eq('id', req.requester_id).single()
          if (reqUser?.email) {
            const itemRows: Cell[][] = items.map((it, i) => {
              const row: Cell[] = [String(i + 1), String(it['item_name'] ?? ''), { text: String(it['requested_qty'] ?? ''), right: true }]
              if (action === 'approved') {
                const a = approvedOf(it)
                row.push(a === 0
                  ? { text: '제외', color: MAIL_COLOR.danger, bold: true, right: true }
                  : { text: String(a), color: a !== Number(it['requested_qty']) ? MAIL_COLOR.pending : MAIL_COLOR.success, bold: true, right: true })
              }
              return row
            })
            await sendMail(
              reqUser.email,
              `[에이텍모빌리티 자재관리] 자재요청 ${st.label} · ${req.requester_name}님`,
              emailLayout({
                title: `자재 요청이 ${st.label} 처리되었습니다`,
                greetingName: req.requester_name,
                bodyHtml: `
                  <p>요청하신 자재 건이 <b style="color:${st.mail};">${st.label}</b> 처리되었습니다.</p>
                  ${infoTable(['항목', '내용'], [
                    ['요청자', who],
                    ['처리결과', { text: st.label, color: st.mail, bold: true }],
                  ])}
                  <p style="margin:8px 0 0; font-weight:700; color:#111111;">요청 품목</p>
                  ${infoTable(itemHead, itemRows)}
                  ${replyMessage ? noteBanner(replyMessage) : ''}`,
              }),
            )
          }
        }
      }
    } catch { /* 알림 실패 무시 */ }
  }

  return NextResponse.json({ ok: true, warnings })
}
