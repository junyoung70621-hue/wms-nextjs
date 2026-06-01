import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

// ── 목록 조회 ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mine = searchParams.get('mine') === '1'

  const isManager = session.user.role === 'admin' || session.user.role === 'materials'

  let query = supabase
    .from('purchase_requests')
    .select('*, processor:users!processed_by(name, center, assigned_center)')
    .order('requested_at', { ascending: false })

  if (mine || !isManager) {
    query = query.eq('requester_id', session.user.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── 새 요청 제출 ──────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  if (session.user.role === 'guest') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { items, reason, cost_note, notes } = await request.json()

  if (!items?.length) return NextResponse.json({ error: '구매 목록을 입력하세요.' }, { status: 400 })
  if (!reason?.trim()) return NextResponse.json({ error: '구매사유를 입력하세요.' }, { status: 400 })
  if (!cost_note?.trim()) return NextResponse.json({ error: '원가반영을 입력하세요.' }, { status: 400 })

  const payload: Record<string, unknown> = {
    requester_id:     session.user.id,
    requester_name:   session.user.name,
    requester_center: session.user.assigned_center ?? session.user.center,
    items,
    reason:    reason.trim(),
    cost_note: cost_note.trim(),
    status:    'pending',
  }
  if (notes?.trim()) payload.notes = notes.trim()

  const { error } = await supabase.from('purchase_requests').insert(payload)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 관리자·자재파트 알림 메일
  try {
    const { data: targets } = await supabase
      .from('users').select('email, assigned_center')
      .in('role', ['admin', 'materials']).eq('is_approved', true)

    const emails = (targets ?? [])
      .filter(u => u.email && u.assigned_center !== '고객지원사업부')
      .map(u => u.email)

    if (emails.length) {
      const itemRows = items.map((it: Record<string, unknown>, i: number) =>
        `<tr><td>${i + 1}</td><td>${it['품명'] ?? ''}</td><td>${it['수량'] ?? ''}</td><td>${it['링크'] ?? '-'}</td></tr>`
      ).join('')

      const nodemailer = await import('nodemailer')
      const t = nodemailer.default.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD },
      })
      await t.sendMail({
        from: `에이텍모빌리티 자재관리 <${process.env.GMAIL_ADDRESS}>`,
        to: emails.join(','),
        subject: `[구매요청] ${session.user.name} (${session.user.assigned_center ?? session.user.center})`,
        html: `
          <h3>구매 요청이 접수되었습니다.</h3>
          <p><b>요청자:</b> ${session.user.name} (${session.user.assigned_center ?? session.user.center})</p>
          <p><b>구매사유:</b> ${reason.trim()}</p>
          <p><b>원가반영:</b> ${cost_note.trim()}</p>
          <table border="1" cellpadding="5" style="border-collapse:collapse">
            <tr><th>No</th><th>품명</th><th>수량</th><th>링크</th></tr>
            ${itemRows}
          </table>
        `,
      })
    }

    // 신청자 접수 확인 메일
    if (session.user.email) {
      const nodemailer = await import('nodemailer')
      const t = nodemailer.default.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD },
      })
      await t.sendMail({
        from: `에이텍모빌리티 자재관리 <${process.env.GMAIL_ADDRESS}>`,
        to: session.user.email,
        subject: '[구매요청] 접수 확인',
        html: `<p>${session.user.name}님의 구매 요청이 접수되었습니다.</p><p>관리자 검토 후 처리 결과를 안내드립니다.</p>`,
      })
    }
  } catch { /* 메일 실패 무시 */ }

  return NextResponse.json({ ok: true })
}

// ── 삭제 (admin) ──────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  const { id } = await request.json()
  const { error } = await supabase.from('purchase_requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
