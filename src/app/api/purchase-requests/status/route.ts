import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { sendTeamsCard, buildRequestCard, type TeamsCell, type TeamsColor } from '@/lib/teams'
import { firePush, sendPushToUsers } from '@/lib/push'

const STATUS_META: Record<string, { label: string; color: TeamsColor }> = {
  in_progress: { label: '처리중', color: 'Warning' },
  completed:   { label: '완료',   color: 'Good' },
  rejected:    { label: '거절',   color: 'Attention' },
  cancelled:   { label: '취소됨', color: 'Default' },
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

  // 처리중·완료·거절 → 푸시 + Teams 알림
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

      if (req) {
        const st = STATUS_META[status] ?? { label: status, color: 'Default' as TeamsColor }
        const itemRows: TeamsCell[][] = (req.items ?? []).map((it: Record<string, unknown>, i: number) =>
          [i + 1, String(it['품명'] ?? ''), { text: String(it['수량'] ?? ''), bold: true }])
        await sendTeamsCard(buildRequestCard({
          title: `🛒 구매 요청 ${st.label}`,
          color: st.color,
          subtitle: `${req.requester_name} (${req.requester_center})`,
          facts: [
            ['요청자', `${req.requester_name} (${req.requester_center})`],
            ['처리결과', st.label],
            ['처리자', session.user.name],
            ['구매사유', req.reason ?? '-'],
          ],
          tableHeaders: ['No', '품명', '수량'],
          tableRows: itemRows,
          note: replyMessage ? `💬 ${replyMessage}` : undefined,
        }))
      }
    } catch { /* 알림 실패 무시 */ }
  }

  // 취소 시 Teams 알림
  if (isOwnerCancel) {
    try {
      const { data: req } = await supabase
        .from('purchase_requests')
        .select('requester_name, requester_center, items, reason')
        .eq('id', id)
        .single()

      if (req) {
        await sendTeamsCard(buildRequestCard({
          title: '🛒 구매 요청 취소',
          color: 'Default',
          subtitle: `${req.requester_name} (${req.requester_center})`,
          facts: [['요청자', `${req.requester_name} (${req.requester_center})`], ['구매사유', req.reason ?? '-']],
          tableHeaders: ['No', '품명', '수량'],
          tableRows: (req.items ?? []).map((it: Record<string, unknown>, i: number) =>
            [i + 1, String(it['품명'] ?? ''), String(it['수량'] ?? '')]),
        }))
      }
    } catch { /* 알림 실패 무시 */ }
  }

  return NextResponse.json({ ok: true })
}
