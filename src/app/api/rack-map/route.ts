import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { getViewableCenters } from '@/constants/centers'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const u = session.user
  const userCenter = u.assigned_center ?? u.center
  const viewable = getViewableCenters(u.role, userCenter)

  const { searchParams } = new URL(request.url)
  const location = searchParams.get('center') ?? (viewable[0] ?? '')

  if (!viewable.includes(location)) {
    return NextResponse.json({ error: '접근 불가 센터' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('warehouse')
    .select('id, item_name, quantity, rack_no, shelf, box_no, category_large, category_mid, category_small')
    .eq('location', location)
    .order('rack_no', { ascending: true, nullsFirst: false })
    .order('shelf')
    .order('item_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], centers: viewable })
}
