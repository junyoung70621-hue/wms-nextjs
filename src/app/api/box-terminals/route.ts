import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { normalizeTrcnId, classifyTaxi } from '@/lib/taxiTracking'
import { classifyTerminal } from '@/lib/terminal'
import { adjustBoxQuantity } from '@/lib/stock'

const TABLE = 'box_terminals'

function canWrite(user: { role: string; center: string; assigned_center: string | null }) {
  const center = user.assigned_center ?? user.center
  return user.role === 'admin' || (center === '자재센터' && user.role !== 'guest')
}

// 박스 대분류(category_large) → 단말기 종류
type BoxKind = 'bus' | 'taxi' | 'unknown'
function boxKindOf(categoryLarge: string | null): BoxKind {
  const c = categoryLarge ?? ''
  if (c.includes('택시')) return 'taxi'
  if (c.includes('버스')) return 'bus'
  return 'unknown'
}
// 박스 종류에 맞게 IH가 인식되는지 (버스 박스엔 버스만, 택시 박스엔 택시만)
function recognizedForBox(kind: BoxKind, ih: string): boolean {
  const isTaxi = classifyTaxi(ih) !== '미분류'
  const isBus = classifyTerminal(ih).device !== '미분류'
  if (kind === 'taxi') return isTaxi
  if (kind === 'bus') return isBus
  return isTaxi || isBus // 대분류 불명확 시 둘 중 하나라도 인식되면 허용
}

// 박스 안의 단말기(IH/기종) 목록 — warehouse_id 또는 좌표(rack_no/shelf/box_no)로 조회
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const warehouseId = searchParams.get('warehouse_id')
  const rackNo = searchParams.get('rack_no')
  const shelf = searchParams.get('shelf')
  const boxNo = searchParams.get('box_no')
  const location = searchParams.get('location')

  let q = supabase.from(TABLE).select('id, trcn_id, device_type, source, created_at')
  if (rackNo || boxNo) {
    // 물리 박스 좌표 기준 (수동 + 택시지정 모두 표시)
    if (location) q = q.eq('location', location)
    if (rackNo) q = q.eq('rack_no', rackNo)
    if (shelf) q = q.eq('shelf', shelf)
    if (boxNo) q = q.eq('box_no', boxNo)
  } else if (warehouseId) {
    q = q.eq('warehouse_id', Number(warehouseId))
  } else {
    return NextResponse.json({ error: 'warehouse_id 또는 좌표 필요' }, { status: 400 })
  }

  const { data, error } = await q.order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// IH 보관(추가/이동) — trcn_id 기준 upsert (한 단말기는 한 박스에만)
// body:
//   - 수동(박스 모달): { warehouse_id, device_type, trcn_ids: string[] }
//   - 좌표지정(택시 자재창고 보관): { location, rack_no, shelf, box_no, items: [{trcn_id, device_type}] }
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  if (!canWrite(session.user)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()

  let location: string | null = body.location ?? null
  let rackNo: string | null = body.rack_no ?? null
  let shelf: string | null = body.shelf ?? null
  let boxNo: string | null = body.box_no ?? null
  let warehouseId: number | null = body.warehouse_id ? Number(body.warehouse_id) : null
  let boxCategoryLarge: string | null = null

  // warehouse_id 가 주어지면 좌표를 그 박스에서 가져옴
  if (warehouseId) {
    const { data: box } = await supabase
      .from('warehouse').select('location, rack_no, shelf, box_no, category_large').eq('id', warehouseId).single()
    if (!box) return NextResponse.json({ error: '박스를 찾을 수 없습니다.' }, { status: 404 })
    location = box.location; rackNo = box.rack_no; shelf = box.shelf; boxNo = box.box_no
    boxCategoryLarge = box.category_large
  } else if (rackNo && boxNo) {
    // 좌표로 매칭되는 warehouse 박스가 있으면 연결(없으면 null)
    let wq = supabase.from('warehouse').select('id, category_large').eq('rack_no', rackNo).eq('box_no', boxNo)
    if (location) wq = wq.eq('location', location)
    if (shelf) wq = wq.eq('shelf', shelf)
    const { data: match } = await wq.limit(1)
    if (match && match[0]) { warehouseId = match[0].id; boxCategoryLarge = match[0].category_large }
  } else {
    return NextResponse.json({ error: '박스 위치(warehouse_id 또는 랙·박스) 필요' }, { status: 400 })
  }

  // 입력 정규화 → [{trcn_id, device_type}]
  type In = { trcn_id: string; device_type: string | null }
  let entries: In[]
  const rejected: string[] = [] // 박스 종류에 안 맞거나 인식 안 되는 단말기 (수동 입력만 차단)
  if (Array.isArray(body.items)) {
    // 택시 자동보관 경로: 그대로 (이미 분류된 데이터)
    entries = (body.items as { trcn_id: unknown; device_type?: string }[])
      .map(it => ({ trcn_id: normalizeTrcnId(it.trcn_id), device_type: (it.device_type ?? null) || null }))
      .filter(e => e.trcn_id)
  } else {
    // 수동 입력: 박스 대분류(버스/택시)에 맞게 인식되는 단말기만 허용
    const kind = boxKindOf(boxCategoryLarge)
    const dev: string | null = (String(body.device_type ?? '').trim() || null)
    const rawIds: unknown[] = body.trcn_ids ?? []
    entries = []
    for (const id of rawIds.map(normalizeTrcnId).filter(Boolean)) {
      if (recognizedForBox(kind, id)) entries.push({ trcn_id: id, device_type: dev })
      else rejected.push(id)
    }
  }
  // trcn_id 중복 제거
  const seen = new Set<string>()
  entries = entries.filter(e => (seen.has(e.trcn_id) ? false : (seen.add(e.trcn_id), true)))
  if (!entries.length) {
    const msg = rejected.length
      ? `이 박스에 맞지 않거나 인식되지 않는 단말기여서 추가할 수 없습니다: ${rejected.join(', ')}`
      : 'IH 번호가 없습니다.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // 이미 등록된 IH 의 기존 박스 파악 (이동/중복 시 수량 정확 반영)
  const { data: existing } = await supabase
    .from(TABLE).select('trcn_id, warehouse_id').in('trcn_id', entries.map(e => e.trcn_id))
  const oldBox = new Map<string, number | null>((existing ?? []).map(r => [r.trcn_id, r.warehouse_id]))

  const rows = entries.map(e => ({
    warehouse_id: warehouseId,
    location, rack_no: rackNo, shelf, box_no: boxNo,
    trcn_id: e.trcn_id, device_type: e.device_type,
    source: body.items ? 'taxi' : 'manual',
    created_by: session.user!.id,
  }))

  // 한 단말기는 한 박스에만 → trcn_id 기준 upsert(이동)
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'trcn_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 박스 수량 증감: 새 박스 +1, 옮겨온 기존 박스 -1 (같은 박스면 변화 없음)
  const deltas = new Map<number, number>()
  for (const e of entries) {
    const old = oldBox.get(e.trcn_id)
    if (old === warehouseId) continue
    if (warehouseId) deltas.set(warehouseId, (deltas.get(warehouseId) ?? 0) + 1)
    if (typeof old === 'number' && old !== warehouseId) deltas.set(old, (deltas.get(old) ?? 0) - 1)
  }
  for (const [id, d] of deltas) await adjustBoxQuantity(id, d)

  return NextResponse.json({ ok: true, stored: rows.length, rack_no: rackNo, box_no: boxNo })
}

// IH 삭제 — body: { id }
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  if (!canWrite(session.user)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  // 삭제 전 박스 파악 → 삭제 후 수량 -1
  const { data: row } = await supabase.from(TABLE).select('warehouse_id').eq('id', body.id).single()
  const { error } = await supabase.from(TABLE).delete().eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (row?.warehouse_id) await adjustBoxQuantity(row.warehouse_id, -1)
  return NextResponse.json({ ok: true })
}
