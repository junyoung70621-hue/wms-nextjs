import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: '아이디와 비밀번호를 입력하세요.' },
        { status: 400 }
      )
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .limit(1)

    if (error || !users || users.length === 0) {
      return NextResponse.json(
        { error: '아이디 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      )
    }

    const user = users[0]

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json(
        { error: '아이디 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      )
    }

    if (!user.is_approved) {
      return NextResponse.json(
        { error: '관리자 승인 대기 중입니다.' },
        { status: 403 }
      )
    }

    const session = await getSession()
    session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      role: user.role,
      center: user.center,
      assigned_center: user.assigned_center ?? null,
    }
    await session.save()

    return NextResponse.json({ ok: true, name: user.name })
  } catch {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
