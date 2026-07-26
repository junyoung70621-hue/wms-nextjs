import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { sendMail, emailLayout, infoTable, type Cell } from '@/lib/email'
import { firePush, sendPushToRoles } from '@/lib/push'

// ── 목록 조회 ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const isManager = session.user.role === 'admin' || session.user.role === 'materials'
  const userCenter = session.user.assigned_center ?? session.user.center

  let query = supabase
    .from('material_requests')
    .select('*, processor:users!processed_by(name, center, assigned_center)')
    .order('requested_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (!isManager) query = query.eq('from_center', userCenter)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── 신규 자재요청 등록 ────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const u = session.user
  if (u.role === 'guest') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { items, notes } = await request.json()
  // items: [{ item_name, current_qty, requested_qty }]
  if (!items?.length) {
    return NextResponse.json({ error: '자재를 1개 이상 선택하세요.' }, { status: 400 })
  }

  const fromCenter = u.assigned_center ?? u.center
  const { error } = await supabase.from('material_requests').insert({
    requester_id:    u.id,
    requester_name:  u.name,
    requester_email: u.email,
    from_center:     fromCenter,
    items,
    notes: notes?.trim() || null,
    status: 'pending',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  firePush(sendPushToRoles(['admin', 'materials'], {
    title: '새 자재요청',
    body: `${u.name}(${fromCenter}) · 자재 ${items.length}건 요청`,
    url: '/material-requests?tab=pending',
    tag: 'material-request',
  }))

  // 관리자·자재파트 알림 메일 + 신청자 접수 확인 메일
  try {
    const { data: targets } = await supabase
      .from('users').select('email, assigned_center')
      .in('role', ['admin', 'materials']).eq('is_approved', true)

    const emails = (targets ?? [])
      .filter(t => t.email && t.assigned_center !== '고객지원사업부')
      .map(t => t.email)

    const who = `${u.name} (${fromCenter})`
    const itemRows: Cell[][] = (items as Record<string, unknown>[]).map((it, i) => [
      String(i + 1),
      String(it['item_name'] ?? ''),
      { text: String(it['current_qty'] ?? ''), right: true },
      { text: String(it['requested_qty'] ?? ''), right: true },
    ])

    if (emails.length) {
      await sendMail(
        emails,
        `[에이텍모빌리티 자재관리] 자재 요청 접수 · ${who}`,
        emailLayout({
          title: '자재 요청이 접수되었습니다',
          bodyHtml: `
            ${infoTable(['항목', '내용'], [
              ['요청자', { text: `<b>${who}</b>` }],
              ...(notes?.trim() ? [['요청메모', notes.trim()] as Cell[]] : []),
            ])}
            <p style="margin:8px 0 0; font-weight:700; color:#1E293B;">요청 품목</p>
            ${infoTable(['No', '자재명', '현재재고', '요청수량'], itemRows)}`,
        }),
      )
    }

    // 신청자 접수 확인 메일
    if (u.email) {
      await sendMail(
        u.email,
        '[에이텍모빌리티 자재관리] 자재 요청 접수 확인',
        emailLayout({
          title: '자재 요청이 정상 접수되었습니다',
          greetingName: u.name,
          bodyHtml: `
            <p>요청하신 자재 건이 접수되었습니다. 관리자 검토 후 처리 결과를 안내드립니다.</p>
            <p style="margin:8px 0 0; font-weight:700; color:#1E293B;">요청 품목</p>
            ${infoTable(['No', '자재명', '현재재고', '요청수량'], itemRows)}`,
        }),
      )
    }
  } catch { /* 메일 실패 무시 */ }

  return NextResponse.json({ ok: true })
}

// ── 취소 (센터 사용자) ────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { id, status } = await request.json()
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  // 이 라우트는 본인 취소 전용. 승인/거절은 action 라우트(admin/materials)에서만.
  if (status !== 'cancelled') return NextResponse.json({ error: '허용되지 않는 상태' }, { status: 400 })

  const { data: reqRow } = await supabase
    .from('material_requests').select('requester_id').eq('id', id).single()
  if (!reqRow) return NextResponse.json({ error: '요청 없음' }, { status: 404 })
  if (reqRow.requester_id !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: '본인 요청만 취소할 수 있습니다.' }, { status: 403 })
  }

  const { data: updated, error } = await supabase
    .from('material_requests')
    .update({ status: 'cancelled', processed_at: new Date().toISOString(), processed_by: session.user.id })
    .eq('id', id)
    .in('status', ['pending', 'on_hold'])
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

// ── 삭제 (admin) ──────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  const { id } = await request.json()
  const { error } = await supabase.from('material_requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
