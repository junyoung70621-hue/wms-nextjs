import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { getViewableCenters, NO_WAREHOUSE } from '@/constants/centers'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const u = session.user
  const userCenter = u.assigned_center ?? u.center
  const viewable = getViewableCenters(u.role, userCenter)
  // 자체 창고가 없는 센터(고객지원사업부)는 열람 목록이 비므로 자재센터 지도 열람 허용
  if (NO_WAREHOUSE.has(userCenter) && viewable.length === 0 && u.role !== 'guest') {
    viewable.push('자재센터')
  }

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

  // 박스 안 단말기(IH) — 자재창고지도에서 IH 번호로도 검색할 수 있도록 함께 반환
  const { data: terminals } = await supabase
    .from('box_terminals')
    .select('trcn_id, rack_no, shelf, box_no, warehouse_id, device_type')
    .eq('location', location)

  return NextResponse.json({ data: data ?? [], centers: viewable, terminals: terminals ?? [] })
}
