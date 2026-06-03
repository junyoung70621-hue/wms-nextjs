import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { sendMail, emailLayout, infoTable, noteBanner, MAIL_COLOR, type Cell } from '@/lib/email'
import { firePush, sendPushToUsers } from '@/lib/push'

const STATUS_META: Record<string, { label: string; color: string }> = {
  in_progress: { label: '처리중', color: MAIL_COLOR.pending },
  completed:   { label: '완료',   color: MAIL_COLOR.success },
  rejected:    { label: '거절',   color: MAIL_COLOR.danger },
  cancelled:   { label: '취소됨', color: MAIL_COLOR.muted },
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { id, status, replyMessage } = await request.json()
  if (!id || !status) return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })

  const isManager = session.user.role === 'admin' || session.user.role === 'materials'
  const isOwnerCancel = status === 'cancelled' // 본인 취소는 누구나 가능

  if (!isManager && !isOwnerCancel) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // 상태 업데이트
  const updatePayload: Record<string, unknown> = {
    status,
    processed_at: new Date().toISOString(),
  }
  if (isManager) updatePayload.processed_by = session.user.id

  const { error: updateError } = await supabase
    .from('purchase_requests')
    .update(updatePayload)
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // 회신 메일 (처리중·완료·거절 → 신청자에게)
  if (isManager && ['in_progress', 'completed', 'rejected'].includes(status)) {
    try {
      const { data: req } = await supabase
        .from('purchase_requests')
        .select('requester_id, requester_name, requester_center, items, reason')
        .eq('id', id)
        .single()

      if (req?.requester_id) {
        const stm = STATUS_META[status]
        firePush(sendPushToUsers([req.requester_id], {
          title: `구매요청 ${stm?.label ?? status}`,
          body: `구매 요청이 ${stm?.label ?? status} 처리되었습니다.`,
          url: '/purchase-requests',
          tag: `purchase-request-${id}`,
        }))
      }

      if (req?.requester_id) {
        const { data: reqUser } = await supabase
          .from('users')
          .select('email')
          .eq('id', req.requester_id)
          .single()

        if (reqUser?.email) {
          const st = STATUS_META[status] ?? { label: status, color: MAIL_COLOR.text }
          const itemRows: Cell[][] = (req.items ?? []).map((it: Record<string, unknown>, i: number) =>
            [String(i + 1), String(it['품명'] ?? ''), { text: String(it['수량'] ?? ''), right: true }])

          await sendMail(
            reqUser.email,
            `[에이텍모빌리티 자재관리] 구매요청 ${st.label} · ${req.requester_name}님`,
            emailLayout({
              title: `구매 요청이 ${st.label} 처리되었습니다`,
              greetingName: req.requester_name,
              bodyHtml: `
                <p>요청하신 구매 건이 <b style="color:${st.color};">${st.label}</b> 처리되었습니다.</p>
                ${infoTable(['항목', '내용'], [
                  ['요청자', `${req.requester_name} (${req.requester_center})`],
                  ['처리결과', { text: st.label, color: st.color, bold: true }],
                  ['구매사유', req.reason ?? '-'],
                ])}
                <p style="margin:8px 0 0; font-weight:700; color:#1E293B;">구매 품목</p>
                ${infoTable(['No', '품명', '수량'], itemRows)}
                ${replyMessage ? noteBanner(replyMessage) : ''}`,
            }),
          )
        }
      }
    } catch { /* 메일 실패 무시 */ }
  }

  // 취소 시 관리자·자재파트에 알림
  if (isOwnerCancel) {
    try {
      const { data: req } = await supabase
        .from('purchase_requests')
        .select('requester_name, requester_center, items, reason')
        .eq('id', id)
        .single()

      const { data: targets } = await supabase
        .from('users').select('email, assigned_center')
        .in('role', ['admin', 'materials']).eq('is_approved', true)

      const emails = (targets ?? [])
        .filter(u => u.email && u.assigned_center !== '고객지원사업부')
        .map(u => u.email)

      if (emails.length && req) {
        await sendMail(
          emails,
          `[에이텍모빌리티 자재관리] 구매요청 취소 · ${req.requester_name} (${req.requester_center})`,
          emailLayout({
            title: '구매 요청이 취소되었습니다',
            bodyHtml: `
              <p><b>${req.requester_name}</b>님이 구매 요청을 취소했습니다.</p>
              ${infoTable(['항목', '내용'], [
                ['요청자', `${req.requester_name} (${req.requester_center})`],
                ['구매사유', req.reason ?? '-'],
              ])}`,
          }),
        )
      }
    } catch { /* 메일 실패 무시 */ }
  }

  return NextResponse.json({ ok: true })
}
