import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { classifyTaxi, normalizeTrcnId, TAXI_TABLE } from '@/lib/taxiTracking'
import { adjustBoxQuantity } from '@/lib/stock'

const SELECT = 'id,upload_id,trcn_id,device_type,direction,is_terminated,is_repair_done,' +
               'driver_name,uploaded_by,uploaded_at,upload_date,file_name,notes'

function canWrite(user: { role: string; center: string; assigned_center: string | null }) {
  const center = user.assigned_center ?? user.center
  return user.role === 'admin' || (center === '자재센터' && user.role !== 'guest')
}

// ── 조회 ──────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const direction = searchParams.get('direction')
  const date = searchParams.get('date')
  const dateFrom = searchParams.get('from')
  const dateTo = searchParams.get('to')
  const limit = Number(searchParams.get('limit') ?? 3000)

  let q = supabase.from(TAXI_TABLE).select(SELECT).order('uploaded_at', { ascending: false })
  if (direction === 'in' || direction === 'out') q = q.eq('direction', direction)
  if (date) q = q.eq('upload_date', date)
  if (dateFrom) q = q.gte('upload_date', dateFrom)
  if (dateTo) q = q.lte('upload_date', dateTo)

  const { data, error } = await q.limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── 저장 (업로드) ─────────────────────────────────────────────────────────────
// body: { direction, upload_date, file_name?, notes?, force?,
//         items?: [{ trcn_id, is_terminated? }]   // in: 행별 해지
//         trcn_ids?: string[], driver_name?        // out: 담당기사 일괄 }
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  if (!canWrite(u)) return NextResponse.json({ error: '업로드 권한 없음' }, { status: 403 })

  const body = await request.json()
  const direction: 'in' | 'out' = body.direction
  const uploadDate: string = body.upload_date
  const fileName: string | null = body.file_name ?? null
  const notes: string | null = body.notes ?? null
  const force: boolean = !!body.force

  if (direction !== 'in' && direction !== 'out')
    return NextResponse.json({ error: 'direction 오류' }, { status: 400 })
  if (!uploadDate) return NextResponse.json({ error: '이동 날짜 누락' }, { status: 400 })

  // 입력 정규화 → { id, terminated }
  let entries: { id: string; terminated: boolean }[]
  if (direction === 'in') {
    const items: { trcn_id: unknown; is_terminated?: boolean }[] = body.items ?? []
    entries = items
      .map(it => ({ id: normalizeTrcnId(it.trcn_id), terminated: !!it.is_terminated }))
      .filter(e => e.id)
  } else {
    const ids: unknown[] = body.trcn_ids ?? []
    entries = ids.map(normalizeTrcnId).filter(Boolean).map(id => ({ id, terminated: false }))
  }
  const driverName: string | null = direction === 'out'
    ? (String(body.driver_name ?? '').trim() || null)
    : null

  if (!entries.length) return NextResponse.json({ inserted: 0, unclassified: 0, dups: 0 })

  // 기종 분류 → 미분류는 저장 제외
  const classified = entries.map(e => ({ ...e, device: classifyTaxi(e.id) }))
  const valid = classified.filter(e => e.device !== '미분류')
  const unclassified = classified.length - valid.length
  if (!valid.length)
    return NextResponse.json({ inserted: 0, unclassified, dups: 0 })

  // 중복 확인 (같은 trcn_id, upload_date, direction)
  const ids = valid.map(e => e.id)
  const dupSet = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data } = await supabase
      .from(TAXI_TABLE).select('trcn_id')
      .eq('upload_date', uploadDate).eq('direction', direction).in('trcn_id', chunk)
    for (const r of data ?? []) dupSet.add(r.trcn_id)
  }

  const toInsert = force ? valid : valid.filter(e => !dupSet.has(e.id))
  if (!toInsert.length)
    return NextResponse.json({ inserted: 0, unclassified, dups: dupSet.size })

  const uploadId = crypto.randomUUID()
  const now = new Date().toISOString()
  const rows = toInsert.map(e => ({
    upload_id: uploadId,
    trcn_id: e.id,
    device_type: e.device,
    direction,
    is_terminated: direction === 'in' ? e.terminated : false,
    is_repair_done: false,
    driver_name: driverName,
    uploaded_by: u.id,
    uploaded_at: now,
    upload_date: uploadDate,
    file_name: fileName,
    notes,
  }))

  const { error } = await supabase.from(TAXI_TABLE).insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 입·출고된 IH 는 자재창고 박스(box_terminals)에서 제거 + 박스 수량 감소
  let removedFromBox = 0
  try {
    const movedIds = rows.map(r => r.trcn_id)
    const boxDelta = new Map<number, number>()
    for (let i = 0; i < movedIds.length; i += 200) {
      const chunk = movedIds.slice(i, i + 200)
      const { data } = await supabase.from('box_terminals').delete().in('trcn_id', chunk).select('id, warehouse_id')
      for (const r of data ?? []) {
        removedFromBox++
        if (r.warehouse_id) boxDelta.set(r.warehouse_id, (boxDelta.get(r.warehouse_id) ?? 0) - 1)
      }
    }
    for (const [id, d] of boxDelta) await adjustBoxQuantity(id, d)
  } catch { /* box_terminals 미설치/오류는 업로드를 막지 않음 */ }

  return NextResponse.json({ inserted: rows.length, unclassified, dups: dupSet.size, removedFromBox })
}

// ── 삭제 (단건 또는 업로드 배치) ───────────────────────────────────────────────
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  const center = u.assigned_center ?? u.center
  const isAdmin = u.role === 'admin'
  const isJjae = center === '자재센터'

  const body = await request.json()
  const id: string | undefined = body.id
  const uploadId: string | undefined = body.upload_id
  if (!id && !uploadId) return NextResponse.json({ error: 'id 또는 upload_id 필요' }, { status: 400 })

  const col = id ? 'id' : 'upload_id'
  const val = id ?? uploadId!
  const { data: rec } = await supabase.from(TAXI_TABLE)
    .select('uploaded_by').eq(col, val).limit(1).single()
  if (!rec) return NextResponse.json({ error: '대상 없음' }, { status: 404 })
  if (!isAdmin && !isJjae && rec.uploaded_by !== u.id)
    return NextResponse.json({ error: '삭제 권한 없음' }, { status: 403 })

  const { error } = await supabase.from(TAXI_TABLE).delete().eq(col, val)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
