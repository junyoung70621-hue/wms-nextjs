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

  const { items, reason, cost_note, notes, attachments } = await request.json()

  if (!items?.length) return NextResponse.json({ error: '구매 목록을 입력하세요.' }, { status: 400 })
  if (!reason?.trim()) return NextResponse.json({ error: '구매사유를 입력하세요.' }, { status: 400 })
  if (!cost_note?.trim()) return NextResponse.json({ error: '원가반영을 입력하세요.' }, { status: 400 })

  // 첨부파일 정규화 — { name, url } 형태만 허용 (최대 5개)
  const files: { name: string; url: string }[] = Array.isArray(attachments)
    ? attachments
        .filter((a: unknown): a is { name: string; url: string } =>
          !!a && typeof (a as { name?: unknown }).name === 'string' && typeof (a as { url?: unknown }).url === 'string')
        .slice(0, 5)
        .map(a => ({ name: String(a.name).slice(0, 200), url: String(a.url) }))
    : []

  const payload: Record<string, unknown> = {
    requester_id:     session.user.id,
    requester_name:   session.user.name,
    requester_center: session.user.assigned_center ?? session.user.center,
    items,
    reason:    reason.trim(),
    cost_note: cost_note.trim(),
    status:    'pending',
    attachments: files,
  }
  if (notes?.trim()) payload.notes = notes.trim()

  const { error } = await supabase.from('purchase_requests').insert(payload)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  firePush(sendPushToRoles(['admin', 'materials'], {
    title: '새 구매요청',
    body: `${session.user.name}(${session.user.assigned_center ?? session.user.center}) · 품목 ${items.length}건`,
    url: '/purchase-requests?tab=pending',
    tag: 'purchase-request',
  }))

  // 관리자·자재파트 알림 메일
  try {
    const { data: targets } = await supabase
      .from('users').select('email, assigned_center')
      .in('role', ['admin', 'materials']).eq('is_approved', true)

    const emails = (targets ?? [])
      .filter(u => u.email && u.assigned_center !== '고객지원사업부')
      .map(u => u.email)

    const who = `${session.user.name} (${session.user.assigned_center ?? session.user.center})`
    const itemRows: Cell[][] = items.map((it: Record<string, unknown>, i: number) => {
      const link = String(it['링크'] ?? '').trim()
      return [
        String(i + 1),
        String(it['품명'] ?? ''),
        { text: String(it['수량'] ?? ''), right: true },
        { text: link ? `<a href="${link}" target="_blank" style="color:#2563EB; text-decoration:underline;">링크 ↗</a>` : '-' },
      ]
    })

    // 첨부파일 다운로드 → 메일 첨부 + 본문 목록
    const mailAttachments: { filename: string; content: Buffer }[] = []
    for (const f of files) {
      try {
        const res = await fetch(f.url)
        if (!res.ok) continue
        const buf = Buffer.from(await res.arrayBuffer())
        mailAttachments.push({ filename: f.name, content: buf })
      } catch { /* 개별 첨부 실패 무시 */ }
    }
    const attachHtml = files.length
      ? `<p style="margin:12px 0 0; font-weight:700; color:#1E293B;">첨부파일 (${files.length})</p>`
        + `<ul style="margin:6px 0 0; padding-left:18px; font-size:13px; color:#334155;">`
        + files.map(f => `<li><a href="${f.url}" target="_blank" style="color:#2563EB; text-decoration:underline;">${f.name}</a></li>`).join('')
        + `</ul>`
      : ''

    if (emails.length) {
      await sendMail(
        emails,
        `[에이텍모빌리티 자재관리] 구매 요청 접수 · ${who}`,
        emailLayout({
          title: '구매 요청이 접수되었습니다',
          bodyHtml: `
            ${infoTable(['항목', '내용'], [
              ['요청자', { text: `<b>${who}</b>` }],
              ['구매사유', reason.trim()],
              ['원가반영', cost_note.trim()],
            ])}
            <p style="margin:8px 0 0; font-weight:700; color:#1E293B;">구매 품목</p>
            ${infoTable(['No', '품명', '수량', '링크'], itemRows)}
            ${attachHtml}`,
        }),
        mailAttachments,
      )
    }

    // 신청자 접수 확인 메일
    if (session.user.email) {
      await sendMail(
        session.user.email,
        '[에이텍모빌리티 자재관리] 구매 요청 접수 확인',
        emailLayout({
          title: '구매 요청이 정상 접수되었습니다',
          greetingName: session.user.name,
          bodyHtml: `
            <p>요청하신 구매 건이 접수되었습니다. 관리자 검토 후 처리 결과를 안내드립니다.</p>
            ${infoTable(['항목', '내용'], [['구매사유', reason.trim()]])}
            <p style="margin:8px 0 0; font-weight:700; color:#1E293B;">구매 품목</p>
            ${infoTable(['No', '품명', '수량', '링크'], itemRows)}
            ${attachHtml}`,
        }),
        mailAttachments,
      )
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
