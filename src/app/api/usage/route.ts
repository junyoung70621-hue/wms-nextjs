import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

type UploadRow = {
  item_name: string
  erp_code?: string
  quantity: number
  reason?: string
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const u = session.user
  if (u.role === 'guest') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const userCenter   = u.assigned_center ?? u.center
  const isAdmin      = u.role === 'admin'

  const body = await request.json()
  const rows: UploadRow[] = body.rows ?? []
  const centerOverride: string | undefined = body.center

  const targetCenter = (isAdmin && centerOverride) ? centerOverride : userCenter

  if (!rows.length) return NextResponse.json({ error: '행이 없습니다' }, { status: 400 })

  const results: Record<string, unknown>[] = []

  for (const row of rows) {
    if (!row.item_name?.trim() || !(row.quantity >= 1)) {
      results.push({ ...row, ok: false, error: '자재명 또는 수량 오류' })
      continue
    }

    let q = supabase
      .from('warehouse')
      .select('id, item_name, quantity, erp_code, location')
      .eq('location', targetCenter)

    if (row.erp_code?.trim()) {
      q = q.eq('erp_code', row.erp_code.trim())
    } else {
      q = q.ilike('item_name', row.item_name.trim())
    }

    const { data: items } = await q.limit(1)
    const item = items?.[0]

    if (!item) {
      results.push({ ...row, ok: false, error: `'${row.item_name}' 자재를 찾을 수 없음 (${targetCenter})` })
      continue
    }

    if ((item.quantity ?? 0) < row.quantity) {
      results.push({ ...row, ok: false, error: `재고 부족 (현재 ${item.quantity ?? 0}개)`, item_name: item.item_name })
      continue
    }

    const before = item.quantity ?? 0
    const after  = before - row.quantity

    await supabase.from('warehouse').update({
      quantity: after,
      last_modified_by: u.id,
      last_modified_at: new Date().toISOString(),
    }).eq('id', item.id)

    await supabase.from('history').insert({
      actor_id:            u.id,
      item_id:             item.id,
      action_type:         'out',
      quantity:            row.quantity,
      reason:              row.reason?.trim() || '사용내역 업로드',
      from_center:         targetCenter,
      snapshot_qty_before: before,
      snapshot_qty_after:  after,
    })

    results.push({ ok: true, item_name: item.item_name, quantity: row.quantity, before, after, reason: row.reason })
  }

  return NextResponse.json({ results })
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const center   = searchParams.get('center')
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '200'), 1000)
  const dateFrom = searchParams.get('date_from')
  const dateTo   = searchParams.get('date_to')

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

  if (center)   query = query.eq('from_center', center)
  if (dateFrom) query = query.gte('acted_at', `${dateFrom}T00:00:00+09:00`)
  if (dateTo)   query = query.lte('acted_at', `${dateTo}T23:59:59+09:00`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
}
