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
    .select('id, item_name, location, quantity, category_large')
    .in('location', viewable)

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })

  const centerMap: Record<string, { items: number; total_qty: number; zero: number }> = {}
  for (const row of warehouseRows ?? []) {
    const loc = row.location ?? '미지정'
    if (!centerMap[loc]) centerMap[loc] = { items: 0, total_qty: 0, zero: 0 }
    centerMap[loc].items += 1
    centerMap[loc].total_qty += row.quantity ?? 0
    if ((row.quantity ?? 0) === 0) centerMap[loc].zero += 1
  }

  const centers = viewable
    .filter(c => centerMap[c])
    .map(c => ({ center: c, ...centerMap[c] }))

  const totalItems = (warehouseRows ?? []).length
  const totalQty   = (warehouseRows ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0)

  // 재고 없음 품목 (상위 10개)
  const zeroStock = (warehouseRows ?? [])
    .filter(r => (r.quantity ?? 0) === 0)
    .slice(0, 10)
    .map(r => ({ id: r.id, item_name: r.item_name, location: r.location, category_large: r.category_large }))

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

  // 3b. 대기중 이동 신청 수
  let trQuery = supabase
    .from('transfers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (u.role === 'materials') {
    trQuery = trQuery.or('from_center.eq.자재센터,to_center.eq.자재센터')
  } else if (!isManager) {
    trQuery = trQuery.or(`from_center.eq.${userCenter},to_center.eq.${userCenter}`)
  }
  const { count: trPending } = await trQuery

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
      mat_pending:  matPending  ?? 0,
      pur_pending:  purPending  ?? 0,
      tr_pending:   trPending   ?? 0,
      zero_stock:   (warehouseRows ?? []).filter(r => (r.quantity ?? 0) === 0).length,
    },
    centers,
    history: history ?? [],
    zero_stock_items: zeroStock,
  })
}
