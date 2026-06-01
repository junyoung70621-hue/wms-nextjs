import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { id, reply } = await request.json()
  if (!id || !reply?.trim()) {
    return NextResponse.json({ error: '답변 내용을 입력하세요.' }, { status: 400 })
  }

  // 문의 조회
  const { data: inq } = await supabase.from('inquiries').select('*').eq('id', id).single()
  if (!inq) return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 })

  const { error } = await supabase.from('inquiries').update({
    reply,
    status:          'answered',
    answered_at:     new Date().toISOString(),
    answered_by_name: session.user.name,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 신청자 답변 알림 메일
  if (inq.requester_email) {
    try {
      const nodemailer = await import('nodemailer')
      const t = nodemailer.default.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD },
      })
      await t.sendMail({
        from: `에이텍모빌리티 자재관리 <${process.env.GMAIL_ADDRESS}>`,
        to: inq.requester_email,
        subject: `[문의 답변] ${inq.title}`,
        html: `<p>${inq.requester_name}님, 문의하신 내용에 답변이 등록됐습니다.</p>
               <p><b>문의:</b> ${inq.title}</p>
               <p><b>답변:</b><br>${reply.replace(/\n/g, '<br>')}</p>
               <p>답변자: ${session.user.name}</p>`,
      })
    } catch { /* 무시 */ }
  }

  return NextResponse.json({ ok: true })
}
