import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // 승인된 유저 목록
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, name, username, center, assigned_center, role')
    .eq('is_approved', true)
    .order('center')

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  if (!users || users.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // 유저별 최근 활동 (history 기준)
  const { data: acts } = await supabase
    .from('history')
    .select('actor_id, acted_at')
    .order('acted_at', { ascending: false })
    .limit(5000)

  const latestMap: Record<string, string> = {}
  for (const a of acts ?? []) {
    if (!latestMap[a.actor_id]) latestMap[a.actor_id] = a.acted_at
  }

  const now = Date.now()
  const result = users.map(u => {
    const lastAt = latestMap[u.id] ?? null
    const diffMs = lastAt ? now - new Date(lastAt).getTime() : null
    const online = diffMs !== null && diffMs < 8 * 60 * 60 * 1000
    return { ...u, last_active: lastAt, online }
  })

  // 최근 활동 유저 먼저
  result.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1
    if (!a.last_active) return 1
    if (!b.last_active) return -1
    return new Date(b.last_active).getTime() - new Date(a.last_active).getTime()
  })

  return NextResponse.json({ data: result })
}
