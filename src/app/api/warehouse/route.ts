import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) {
    return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const location = searchParams.get('center')

  let query = supabase
    .from('warehouse')
    .select(
      'id, item_name, quantity, rack_no, shelf, box_no, ' +
      'category_large, category_mid, category_small, ' +
      'location, erp_name, erp_code, notes'
    )
    .order('item_name')

  if (location && location !== '전체') {
    query = query.eq('location', location)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
