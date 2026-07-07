import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { sendMail, emailLayout, infoTable, textBlock } from '@/lib/email'

export async function GET() {
  const session = await getSession()
  // 둘러보기 모드: 문의는 개인 데이터(이메일 포함)라 익명에겐 빈 목록만 반환
  if (!session.user) return NextResponse.json({ data: [] })

  const isAdmin = session.user.role === 'admin'
  let query = supabase.from('inquiries').select('*').order('created_at', { ascending: false })
  if (!isAdmin) query = query.eq('requester_id', session.user.id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { title, content } = await request.json()
  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: '제목과 내용을 입력하세요.' }, { status: 400 })
  }

  const { error } = await supabase.from('inquiries').insert({
    requester_id:    session.user.id,
    requester_name:  session.user.name,
    requester_email: session.user.email,
    from_center:     session.user.assigned_center ?? session.user.center,
    title:           title.trim(),
    content:         content.trim(),
    status:          'pending',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 관리자 이메일 알림 (선택 — 실패해도 무시)
  try {
    const { data: admins } = await supabase
      .from('users').select('email, assigned_center')
      .eq('role', 'admin').eq('is_approved', true)
    const emails = (admins ?? [])
      .filter(u => u.email && u.assigned_center !== '고객지원사업부')
      .map(u => u.email)
    if (emails.length) {
      const who = `${session.user.name} (${session.user.assigned_center ?? session.user.center})`
      await sendMail(
        emails,
        `[에이텍모빌리티 자재관리] 새 문의 · ${title.trim()}`,
        emailLayout({
          title: '새 문의가 등록되었습니다',
          bodyHtml: `
            ${infoTable(['항목', '내용'], [
              ['등록자', { text: `<b>${who}</b>` }],
              ['제목', title.trim()],
            ])}
            <p style="margin:8px 0 0; font-weight:700; color:#1E293B;">문의 내용</p>
            ${textBlock(content.trim())}`,
        }),
      )
    }
  } catch { /* 메일 실패 무시 */ }

  return NextResponse.json({ ok: true })
}
