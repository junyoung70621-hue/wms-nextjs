import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const center = searchParams.get('center')
  if (!center) return NextResponse.json({ error: 'center 필요' }, { status: 400 })

  const { data: r1 } = await supabase.from('users')
    .select('id,name,username,role')
    .eq('assigned_center', center).eq('is_approved', true).neq('role', 'guest')
  const { data: r2 } = await supabase.from('users')
    .select('id,name,username,role')
    .eq('center', center).eq('is_approved', true).neq('role', 'guest')

  const seen = new Set<string>()
  const result: { id: string; name: string; username: string; role: string }[] = []
  for (const u of [...(r1 ?? []), ...(r2 ?? [])]) {
    if (!seen.has(u.id)) { seen.add(u.id); result.push(u) }
  }
  return NextResponse.json({ data: result })
}
