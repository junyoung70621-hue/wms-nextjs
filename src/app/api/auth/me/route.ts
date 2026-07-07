import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

// 세션은 로그인 시점의 스냅샷이라, 관리자가 역할·센터를 바꿔도 재로그인 전까지
// 권한이 갱신되지 않는다. 여기서 매 호출마다 DB의 최신 사용자 정보를 다시 읽어
// 세션을 갱신하면, 관리자 변경이 (탭 재활성화/페이지 이동 시점에) 즉시 반영된다.
// SessionGuard 가 마운트·탭 활성화마다 /api/auth/me 를 호출하므로 쿠키가 최신화되고,
// 이후 서버 API 들의 권한 검사(session.user)도 최신 값으로 동작한다.
export async function GET() {
  const session = await getSession()
  if (!session.user) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const { data: fresh, error } = await supabase
    .from('users')
    .select('id, username, name, email, phone, role, center, assigned_center, is_approved')
    .eq('id', session.user.id)
    .single()

  // 사용자가 삭제됐거나 승인이 취소되면 세션 종료 → 로그인 화면으로
  if (error || !fresh || !fresh.is_approved) {
    session.destroy()
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const next = {
    id: fresh.id,
    username: fresh.username,
    name: fresh.name,
    email: fresh.email,
    phone: fresh.phone ?? null,
    role: fresh.role,
    center: fresh.center,
    assigned_center: fresh.assigned_center ?? null,
  }

  // 변경이 있을 때만 쿠키 재발급(불필요한 Set-Cookie 방지)
  if (JSON.stringify(next) !== JSON.stringify(session.user)) {
    session.user = next
    await session.save()
  }

  return NextResponse.json({ user: session.user, loginAt: session.loginAt ?? null })
}
