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

// ponytail: 인스턴스 로컬 레이트리밋 — 서버리스 다중 인스턴스에선 느슨해짐, 문제 시 DB 기반으로
const attempts = new Map<string, { count: number; resetAt: number }>()
function rateLimited(key: string, max = 3, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now()
  const e = attempts.get(key)
  if (!e || now > e.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  e.count++
  return e.count > max
}

export async function POST(request: Request) {
  try {
    const { username, email } = await request.json()

    if (!username || !email) {
      return NextResponse.json(
        { error: '아이디와 이메일을 입력하세요.' },
        { status: 400 }
      )
    }

    if (rateLimited(`reset:${String(email).toLowerCase()}`)) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      )
    }

    // 아이디+이메일이 같은 계정과 일치할 때만 발급.
    // 계정 존재 여부는 응답으로 노출하지 않는다 (이메일 열거 방지 — 항상 ok).
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .eq('username', username)
      .eq('email', email)
      .limit(1)

    if (users && users.length > 0) {
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
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
