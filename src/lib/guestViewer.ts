import type { SessionUser } from './session'

// 둘러보기(게스트) 모드 — 비로그인 방문자에게 실제 화면을 보여줄 때
// 컴포넌트/조회 API에 주입하는 읽기 전용 가상 사용자.
// 쓰기(POST/PATCH/DELETE)는 여전히 실제 세션이 필요하다.
export const GUEST_VIEWER: SessionUser = {
  id: '00000000-0000-0000-0000-000000000000',
  username: 'guest',
  name: '방문자',
  email: '',
  phone: null,
  role: 'guest',
  center: '자재센터',
  assigned_center: null,
}

// 익명(둘러보기) 응답에서 개인 이름 마스킹: '김철수' → '김**'
export function maskName(name?: string | null): string {
  if (!name) return ''
  return name.length <= 1 ? `${name}*` : name[0] + '*'.repeat(Math.min(name.length - 1, 2))
}

// history/usage/notices 류의 `users(name)` 조인 결과에서 이름 마스킹
// (supabase 조인이 객체/배열 어느 쪽이든 안전하게 처리)
export function maskActorNames<T>(rows: T[]): T[] {
  return rows.map(r => {
    if (!r || typeof r !== 'object') return r
    const rec = r as Record<string, unknown>
    const u = rec.users
    if (Array.isArray(u)) {
      return {
        ...rec,
        users: u.map(x => ({ ...(x as object), name: maskName((x as { name?: string }).name) })),
      } as T
    }
    if (u && typeof u === 'object') {
      return { ...rec, users: { ...u, name: maskName((u as { name?: string }).name) } } as T
    }
    return r
  })
}
