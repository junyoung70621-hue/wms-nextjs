import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { getViewableCenters } from '@/constants/centers'

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const u = session.user
  const isManager = u.role === 'admin' || u.role === 'materials'
  const userCenter = u.assigned_center ?? u.center
  const viewable = getViewableCenters(u.role, userCenter)

  // 1. 센터별 재고 집계
  const { data: warehouseRows, error: wErr } = await supabase
    .from('warehouse')
    .select('location, quantity')
    .in('location', viewable)

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })

  const centerMap: Record<string, { items: number; total_qty: number }> = {}
  for (const row of warehouseRows ?? []) {
    const loc = row.location ?? '미지정'
    if (!centerMap[loc]) centerMap[loc] = { items: 0, total_qty: 0 }
    centerMap[loc].items += 1
    centerMap[loc].total_qty += row.quantity ?? 0
  }

  const centers = viewable
    .filter(c => centerMap[c])
    .map(c => ({ center: c, ...centerMap[c] }))

  const totalItems = (warehouseRows ?? []).length
  const totalQty   = (warehouseRows ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0)

  // 2. 대기중 자재요청 수
  let matQuery = supabase
    .from('material_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (!isManager) matQuery = matQuery.eq('from_center', userCenter)
  const { count: matPending } = await matQuery

  // 3. 대기중 구매요청 수
  let purQuery = supabase
    .from('purchase_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (!isManager) purQuery = purQuery.eq('requester_center', userCenter)
  const { count: purPending } = await purQuery

  // 4. 최근 입출고 이력 (10건)
  let histQuery = supabase
    .from('history')
    .select(
      'id, action_type, quantity, reason, from_center, to_center, acted_at, ' +
      'warehouse(item_name, location), users!actor_id(name)'
    )
    .order('acted_at', { ascending: false })
    .limit(10)

  if (!isManager) {
    histQuery = histQuery.or(`from_center.eq.${userCenter},to_center.eq.${userCenter}`)
  }

  const { data: history } = await histQuery

  return NextResponse.json({
    summary: {
      total_items: totalItems,
      total_qty: totalQty,
      mat_pending: matPending ?? 0,
      pur_pending: purPending ?? 0,
    },
    centers,
    history: history ?? [],
  })
}
