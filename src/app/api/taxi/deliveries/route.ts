import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { normalizeTrcnId, TAXI_DELIVERY_TABLE } from '@/lib/taxiTracking'

const SELECT = 'id,delivery_id,trcn_id,device_type,driver_name,dealer_name,' +
               'delivery_date,delivered_by,delivered_at,notes'

function canWrite(user: { role: string; center: string; assigned_center: string | null }) {
  const center = user.assigned_center ?? user.center
  return user.role === 'admin' || (center === '자재센터' && user.role !== 'guest')
}

// ── 배송 이력 조회 ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get('from')
  const dateTo = searchParams.get('to')
  const limit = Number(searchParams.get('limit') ?? 3000)

  let q = supabase.from(TAXI_DELIVERY_TABLE).select(SELECT).order('delivered_at', { ascending: false })
  if (dateFrom) q = q.gte('delivery_date', dateFrom)
  if (dateTo) q = q.lte('delivery_date', dateTo)

  const { data, error } = await q.limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── 배송완료 처리 ─────────────────────────────────────────────────────────────
// body: { delivery_date, dealer_name?, notes?, rows: [{ trcn_id, device_type, driver_name }] }
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  if (!canWrite(u)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const deliveryDate: string = body.delivery_date
  const dealerName: string | null = (String(body.dealer_name ?? '').trim() || null)
  const notes: string | null = (String(body.notes ?? '').trim() || null)
  const rawRows: { trcn_id: unknown; device_type?: string; driver_name?: string }[] = body.rows ?? []
  if (!deliveryDate) return NextResponse.json({ error: '배송 날짜 누락' }, { status: 400 })

  const rows = rawRows
    .map(r => ({
      trcn_id: normalizeTrcnId(r.trcn_id),
      device_type: r.device_type || '미분류',
      driver_name: String(r.driver_name ?? '').trim(),
    }))
    .filter(r => r.trcn_id && r.driver_name)
  if (!rows.length) return NextResponse.json({ error: '대상 없음' }, { status: 400 })

  const deliveryId = crypto.randomUUID()
  const now = new Date().toISOString()
  const insert = rows.map(r => ({
    delivery_id: deliveryId,
    trcn_id: r.trcn_id,
    device_type: r.device_type,
    driver_name: r.driver_name,
    dealer_name: dealerName,
    delivery_date: deliveryDate,
    delivered_by: u.id,
    delivered_at: now,
    notes,
  }))

  const { error } = await supabase.from(TAXI_DELIVERY_TABLE).insert(insert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, inserted: insert.length })
}

// ── 배송 기록 삭제 (배송완료 취소 → 다시 기사 재고로) ───────────────────────────
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  if (!canWrite(session.user)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const id: string | undefined = body.id
  const deliveryId: string | undefined = body.delivery_id
  if (!id && !deliveryId) return NextResponse.json({ error: 'id 또는 delivery_id 필요' }, { status: 400 })

  const col = id ? 'id' : 'delivery_id'
  const { error } = await supabase.from(TAXI_DELIVERY_TABLE).delete().eq(col, id ?? deliveryId!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
