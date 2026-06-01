import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const center = searchParams.get('center')
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '200'), 1000)

  let query = supabase
    .from('history')
    .select(
      'id, action_type, quantity, reason, from_center, ' +
      'snapshot_qty_before, snapshot_qty_after, acted_at, ' +
      'warehouse(item_name, location), users(name)'
    )
    .eq('action_type', 'out')
    .order('acted_at', { ascending: false })
    .limit(limit)

  if (center) query = query.eq('from_center', center)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
}
