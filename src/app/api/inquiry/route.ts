import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

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
      const nodemailer = await import('nodemailer')
      const t = nodemailer.default.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD },
      })
      await t.sendMail({
        from: `에이텍모빌리티 자재관리 <${process.env.GMAIL_ADDRESS}>`,
        to: emails.join(','),
        subject: `[문의] ${title.trim()}`,
        html: `<p><b>${session.user.name}</b> (${session.user.assigned_center ?? session.user.center})님이 문의를 등록했습니다.</p><p><b>제목:</b> ${title.trim()}</p><p><b>내용:</b><br>${content.trim().replace(/\n/g, '<br>')}</p>`,
      })
    }
  } catch { /* 메일 실패 무시 */ }

  return NextResponse.json({ ok: true })
}
