import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

const STATUS_KO: Record<string, string> = {
  in_progress: '🔄 처리중',
  completed:   '✅ 완료',
  rejected:    '❌ 거절',
  cancelled:   '🚫 취소됨',
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
        const { data: reqUser } = await supabase
          .from('users')
          .select('email')
          .eq('id', req.requester_id)
          .single()

        if (reqUser?.email) {
          const nodemailer = await import('nodemailer')
          const t = nodemailer.default.createTransport({
            service: 'gmail',
            auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD },
          })
          const statusLabel = STATUS_KO[status] ?? status
          const itemRows = (req.items ?? []).map((it: Record<string, unknown>, i: number) =>
            `<tr><td>${i + 1}</td><td>${it['품명'] ?? ''}</td><td>${it['수량'] ?? ''}</td></tr>`
          ).join('')

          await t.sendMail({
            from: `에이텍모빌리티 자재관리 <${process.env.GMAIL_ADDRESS}>`,
            to: reqUser.email,
            subject: `[구매요청] ${statusLabel} — ${req.requester_name}님의 요청`,
            html: `
              <h3>구매 요청이 <b>${statusLabel}</b> 처리되었습니다.</h3>
              <p><b>요청자:</b> ${req.requester_name} (${req.requester_center})</p>
              <p><b>구매사유:</b> ${req.reason ?? '-'}</p>
              ${replyMessage ? `<p><b>담당자 메시지:</b> ${replyMessage}</p>` : ''}
              <table border="1" cellpadding="5" style="border-collapse:collapse">
                <tr><th>No</th><th>품명</th><th>수량</th></tr>
                ${itemRows}
              </table>
            `,
          })
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
        const nodemailer = await import('nodemailer')
        const t = nodemailer.default.createTransport({
          service: 'gmail',
          auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD },
        })
        await t.sendMail({
          from: `에이텍모빌리티 자재관리 <${process.env.GMAIL_ADDRESS}>`,
          to: emails.join(','),
          subject: `[구매요청 취소] ${req.requester_name} (${req.requester_center})`,
          html: `<p>${req.requester_name}님이 구매 요청을 취소했습니다.</p><p><b>구매사유:</b> ${req.reason ?? '-'}</p>`,
        })
      }
    } catch { /* 메일 실패 무시 */ }
  }

  return NextResponse.json({ ok: true })
}
