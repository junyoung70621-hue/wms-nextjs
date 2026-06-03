import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { sendMail, emailLayout, bigCode, warnText } from '@/lib/email'

function generateTempPassword(length = 10): string {
  const chars =
    'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: '이메일을 입력하세요.' },
        { status: 400 }
      )
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .eq('email', email)
      .limit(1)

    if (!users || users.length === 0) {
      return NextResponse.json(
        { error: '등록된 이메일이 아닙니다.' },
        { status: 404 }
      )
    }

    const user = users[0]
    const tempPw = generateTempPassword()
    const hashed = await bcrypt.hash(tempPw, 10)

    await supabase
      .from('users')
      .update({ password_hash: hashed })
      .eq('id', user.id)

    await sendMail(
      email,
      '[에이텍모빌리티 자재관리] 임시 비밀번호 발급',
      emailLayout({
        title: '임시 비밀번호가 발급되었습니다',
        greetingName: user.name,
        bodyHtml: `
          <p>요청하신 임시 비밀번호입니다. 아래 비밀번호로 로그인해 주세요.</p>
          ${bigCode(tempPw)}
          ${warnText('보안을 위해 로그인 후 반드시 비밀번호를 변경해 주세요.')}`,
      }),
    )

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
