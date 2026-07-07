import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 앞 절반만 노출, 나머지는 * 처리 (예: jy_kim → jy_***)
function maskUsername(username: string): string {
  const keep = Math.max(1, Math.ceil(username.length / 2))
  return username.slice(0, keep) + '*'.repeat(Math.max(username.length - keep, 2))
}

export async function POST(request: Request) {
  try {
    const { name, email } = await request.json()

    if (!name || !email) {
      return NextResponse.json(
        { error: '이름과 이메일을 입력하세요.' },
        { status: 400 }
      )
    }

    // 무차별 조회 방지를 위해 이름+이메일 동시 일치만 허용
    const { data: users } = await supabase
      .from('users')
      .select('username')
      .eq('name', name)
      .eq('email', email)
      .limit(1)

    if (!users || users.length === 0) {
      return NextResponse.json(
        { error: '일치하는 회원 정보가 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, username: maskUsername(users[0].username) })
  } catch {
    return NextResponse.json(
      { error: '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
