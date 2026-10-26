import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { sendTeamsCard, buildRequestCard, type TeamsCell } from '@/lib/teams'
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

  // Teams 알림 (자재요청·구매요청 채널)
  const who = `${session.user.name} (${session.user.assigned_center ?? session.user.center})`
  const itemRows: TeamsCell[][] = items.map((it: Record<string, unknown>, i: number) => {
    const link = String(it['링크'] ?? '').trim()
    return [i + 1, String(it['품명'] ?? ''), { text: String(it['수량'] ?? ''), bold: true }, link ? `[링크 ↗](${link})` : '-']
  })
  const attachNote = files.length
    ? `📎 첨부파일 (${files.length})\n\n` + files.map(f => `- [${f.name}](${f.url})`).join('\n\n')
    : undefined
  await sendTeamsCard(buildRequestCard({
    title: '🛒 구매 요청 접수',
    subtitle: `${who} · 품목 ${items.length}건`,
    facts: [['요청자', who], ['구매사유', reason.trim()], ['원가반영', cost_note.trim()]],
    tableHeaders: ['No', '품명', '수량', '링크'],
    tableRows: itemRows,
    note: attachNote,
  }))

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
