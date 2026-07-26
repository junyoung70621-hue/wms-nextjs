import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { sendMail, emailLayout, infoTable } from '@/lib/email'
import { CENTERS } from '@/constants/centers'

export async function POST(request: Request) {
  try {
    const { username, password, name, email, phone, center } =
      await request.json()

    if (!username || !password || !name || !email || !center) {
      return NextResponse.json(
        { error: '* 표시 항목은 필수입니다.' },
        { status: 400 }
      )
    }
    if (!(CENTERS as readonly string[]).includes(center)) {
      return NextResponse.json(
        { error: '올바른 소속 센터를 선택하세요.' },
        { status: 400 }
      )
    }
    if (String(password).length < 6) {
      return NextResponse.json(
        { error: '비밀번호는 6자 이상이어야 합니다.' },
        { status: 400 }
      )
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .limit(1)

    if (existingUser && existingUser.length > 0) {
      return NextResponse.json(
        { error: '이미 사용 중인 아이디입니다.' },
        { status: 409 }
      )
    }

    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .limit(1)

    if (existingEmail && existingEmail.length > 0) {
      return NextResponse.json(
        { error: '이미 등록된 이메일입니다.' },
        { status: 409 }
      )
    }

    const password_hash = await bcrypt.hash(password, 10)

    const { error } = await supabase.from('users').insert({
      username,
      password_hash,
      name,
      email,
      phone: phone || null,
      center,
      role: 'guest',
      is_approved: false,
    })

    if (error) {
      return NextResponse.json(
        { error: '회원가입 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // 메일 (실패해도 가입은 성공 처리)
    try {
      // 신청자 접수 안내
      await sendMail(
        email,
        '[에이텍모빌리티 자재관리] 회원가입 신청이 접수되었습니다',
        emailLayout({
          title: '회원가입 신청이 접수되었습니다',
          greetingName: name,
          bodyHtml: `
            <p>회원가입 신청이 정상적으로 접수되었습니다. <b>관리자 승인 후</b> 로그인하실 수 있습니다.</p>
            ${infoTable(['항목', '내용'], [
              ['아이디', username],
              ['이름', name],
              ['소속 센터', center],
            ])}
            <p style="margin-top:10px; color:#64748B; font-size:13px;">승인이 완료되면 별도 메일로 안내드립니다.</p>`,
        }),
      )

      // 관리자 알림
      const { data: admins } = await supabase
        .from('users').select('email, assigned_center')
        .eq('role', 'admin').eq('is_approved', true)
      const adminEmails = (admins ?? [])
        .filter(u => u.email && u.assigned_center !== '고객지원사업부')
        .map(u => u.email)
      if (adminEmails.length) {
        await sendMail(
          adminEmails,
          `[에이텍모빌리티 자재관리] 새 회원가입 신청 · ${name}`,
          emailLayout({
            title: '새 회원가입 신청이 있습니다',
            bodyHtml: `
              <p>승인 대기 중인 신규 가입 신청입니다. 관리자 페이지에서 승인해 주세요.</p>
              ${infoTable(['항목', '내용'], [
                ['이름', { text: `<b>${name}</b>` }],
                ['아이디', username],
                ['소속 센터', center],
                ['이메일', email],
                ['연락처', phone || '-'],
              ])}`,
          }),
        )
      }
    } catch { /* 메일 실패 무시 */ }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
