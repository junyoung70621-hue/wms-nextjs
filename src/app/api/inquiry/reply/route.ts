import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { sendMail, emailLayout, infoTable, textBlock, MAIL_COLOR } from '@/lib/email'

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
      await sendMail(
        inq.requester_email,
        `[에이텍모빌리티 자재관리] 문의 답변 · ${inq.title}`,
        emailLayout({
          title: '문의하신 내용에 답변이 등록되었습니다',
          greetingName: inq.requester_name,
          bodyHtml: `
            ${infoTable(['항목', '내용'], [['문의', inq.title]])}
            <p style="margin:8px 0 0; font-weight:700; color:#1E293B;">답변</p>
            ${textBlock(reply)}
            <p style="margin:10px 0 0; font-size:13px; color:${MAIL_COLOR.muted};">답변자 · ${session.user.name}</p>`,
        }),
      )
    } catch { /* 무시 */ }
  }

  return NextResponse.json({ ok: true })
}
