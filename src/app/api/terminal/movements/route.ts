import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { classifyTerminal, normalizeTrcnId, TERMINAL_TABLE } from '@/lib/terminal'
import { TRACKING_CENTERS } from '@/lib/busTracking'
import { firePush, sendPushToCenters } from '@/lib/push'

const ASSIGN = 'bus_terminal_assignments'
const HIST = 'bus_terminal_history'

function nowKst() { return new Date(Date.now() + 9 * 3600000).toISOString() }

function perms(user: { role: string; center: string; assigned_center: string | null }) {
  const center = user.assigned_center ?? user.center
  const isAdmin = user.role === 'admin'
  const isJjae = center === '자재센터'
  return {
    center,
    isAdmin,
    isJjae,
    canUpOut: isAdmin || (isJjae && user.role !== 'guest'),
    canUpIn: user.role !== 'guest',
  }
}

// ── 조회 ──────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  // 둘러보기 모드: 이동 목록은 익명 읽기 허용 (개인 이름 없음, 쓰기는 세션 필수)
  await getSession()

  const { searchParams } = new URL(request.url)
  const direction = searchParams.get('direction')
  const date = searchParams.get('date')
  const dateFrom = searchParams.get('from')
  const dateTo = searchParams.get('to')
  const limit = Number(searchParams.get('limit') ?? 3000)

  let q = supabase
    .from(TERMINAL_TABLE)
    .select('id,upload_id,trcn_id,device_type,sub_type,from_center,to_center,' +
            'direction,uploaded_at,upload_date,file_name,uploaded_by,notes')
    .order('uploaded_at', { ascending: false })

  if (direction === 'in' || direction === 'out') q = q.eq('direction', direction)
  if (date) q = q.eq('upload_date', date)
  if (dateFrom) q = q.gte('upload_date', dateFrom)
  if (dateTo) q = q.lte('upload_date', dateTo)

  const { data, error } = await q.limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── 저장 (업로드) ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  const p = perms(u)

  const body = await request.json()
  const direction: 'in' | 'out' = body.direction
  const uploadDate: string = body.upload_date
  const fromCenter: string = body.from_center
  const toCenter: string = body.to_center
  const fileName: string | null = body.file_name ?? null
  const notes: string | null = body.notes ?? null
  const force: boolean = !!body.force
  const rawIds: unknown[] = body.trcn_ids ?? []

  if (direction !== 'in' && direction !== 'out')
    return NextResponse.json({ error: 'direction 오류' }, { status: 400 })
  if (!uploadDate || !fromCenter || !toCenter)
    return NextResponse.json({ error: '필수값 누락' }, { status: 400 })
  if (direction === 'out' && !p.canUpOut)
    return NextResponse.json({ error: '출고 업로드 권한 없음' }, { status: 403 })
  if (direction === 'in' && !p.canUpIn)
    return NextResponse.json({ error: '입고 업로드 권한 없음' }, { status: 403 })

  // 분류 → 유효(미분류 제외)만 추림
  const classified = rawIds
    .map(normalizeTrcnId)
    .filter(Boolean)
    .map(id => ({ id, ...classifyTerminal(id) }))
  const valid = classified.filter(r => r.device !== '미분류')
  const unclassified = classified.length - valid.length

  if (!valid.length)
    return NextResponse.json({ inserted: 0, unclassified, dups: 0, autoReturned: 0 })

  // 중복 확인 (같은 날짜·방향)
  const ids = valid.map(r => r.id)
  const dupSet = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data } = await supabase
      .from(TERMINAL_TABLE)
      .select('trcn_id')
      .eq('upload_date', uploadDate)
      .eq('direction', direction)
      .in('trcn_id', chunk)
    for (const r of data ?? []) dupSet.add(r.trcn_id)
  }

  const toInsert = force ? valid : valid.filter(r => !dupSet.has(r.id))
  if (!toInsert.length)
    return NextResponse.json({ inserted: 0, unclassified, dups: dupSet.size, autoReturned: 0 })

  const uploadId = crypto.randomUUID()
  const now = nowKst()
  const rows = toInsert.map(r => ({
    upload_id: uploadId,
    trcn_id: r.id,
    device_type: r.device,
    sub_type: r.sub,
    from_center: fromCenter,
    to_center: toCenter,
    direction,
    uploaded_by: u.id,
    uploaded_at: now,
    upload_date: uploadDate,
    file_name: fileName,
    notes,
  }))

  const { error } = await supabase.from(TERMINAL_TABLE).insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 입고 시 단말기 배정 자동 반납 (center_defective/미배정 → returned)
  let autoReturned = 0
  if (direction === 'in') {
    try {
      autoReturned = await autoReturnAssignments(toInsert.map(r => r.id), fromCenter, u, now)
    } catch { /* 자동반납 실패는 업로드를 막지 않음 */ }
  }

  // 출고 시 도착 센터(추적대상)의 보유현황에 '미배정(센터보관)'으로 자동 추가 + 센터 인원에게 푸시
  let stocked = 0
  if (direction === 'out' && TRACKING_CENTERS.includes(toCenter)) {
    try {
      stocked = await stockToCenter(toInsert, toCenter, u, now)
    } catch { /* 보유 추가 실패는 업로드를 막지 않음 */ }
    const byDev: Record<string, number> = {}
    for (const r of toInsert) byDev[r.device] = (byDev[r.device] ?? 0) + 1
    const brk = Object.entries(byDev).map(([d, c]) => `${d} ${c}대`).join(' · ')
    firePush(sendPushToCenters([toCenter], {
      title: `${toCenter} 단말기 출고`,
      body: `버스단말기 ${toInsert.length}대가 ${toCenter}로 출고되었습니다.${brk ? `\n${brk}` : ''}`,
      url: '/bus-tracking',
      tag: `terminal-out-${toCenter}`,
    }))
  }

  return NextResponse.json({
    inserted: rows.length,
    unclassified,
    dups: dupSet.size,
    autoReturned,
    stocked,
  })
}

// 출고 도착 센터의 bus_terminal_assignments 에 '미배정' 으로 등록(귀속)하고
// bus_terminal_history 에 '센터 입고' 이력을 남긴다.
//  - 레코드가 없는 신규 IH → 미배정으로 삽입
//  - 과거 반납('returned') 상태로 남아있던 IH 가 다시 출고됨 → 미배정으로 재활성화
//    (안 하면 배정 시 'unassigned' 만 재활용하므로 동일 IH 의 중복 레코드가 생긴다)
//  - 이미 활성 상태(holding/unassigned 등)인 IH 는 건드리지 않는다
async function stockToCenter(
  items: { id: string; device: string; sub: string }[],
  center: string,
  u: { id: string; name: string },
  now: string,
): Promise<number> {
  const ihs = items.map(r => r.id)
  const existing = new Map<string, string>() // ih_code → status
  for (let i = 0; i < ihs.length; i += 200) {
    const chunk = ihs.slice(i, i + 200)
    const { data } = await supabase.from(ASSIGN)
      .select('ih_code,status').eq('center', center).in('ih_code', chunk)
    for (const r of data ?? []) existing.set(r.ih_code, r.status)
  }

  // 신규: 미배정으로 삽입
  const fresh = items.filter(r => !existing.has(r.id))
  if (fresh.length) {
    await supabase.from(ASSIGN).insert(fresh.map(r => ({
      ih_code: r.id, device_type: r.device, sub_type: r.sub, center,
      employee_id: null, employee_name: '(미배정)',
      assigned_at: now, assigned_by: u.id, status: 'unassigned',
    })))
  }

  // 재출고: 반납 상태 → 미배정으로 재활성화
  const reactivate = items.filter(r => existing.get(r.id) === 'returned')
  for (let i = 0; i < reactivate.length; i += 200) {
    const chunk = reactivate.slice(i, i + 200).map(r => r.id)
    await supabase.from(ASSIGN)
      .update({ status: 'unassigned', employee_id: null, employee_name: '(미배정)',
                assigned_at: now, assigned_by: u.id, returned_at: null })
      .eq('center', center).eq('status', 'returned').in('ih_code', chunk)
  }

  // 이력: 이번 출고로 센터에 (재)입고된 단말만 기록
  const stocked = [...fresh, ...reactivate]
  if (stocked.length) {
    await supabase.from(HIST).insert(stocked.map(r => ({
      center, action: 'inbound', ih_code: r.id,
      device_type: r.device, sub_type: r.sub,
      to_employee: '(미배정)', to_status: 'unassigned',
      acted_by: u.id, acted_by_name: u.name, acted_at: now,
    })))
  }
  return stocked.length
}

async function autoReturnAssignments(
  ihCodes: string[],
  fromCenter: string,
  u: { id: string; name: string },
  now: string,
): Promise<number> {
  const matched: { id: string; ih_code: string; device_type: string | null; sub_type: string | null; employee_name: string | null; status: string }[] = []
  for (let i = 0; i < ihCodes.length; i += 200) {
    const chunk = ihCodes.slice(i, i + 200)
    const { data } = await supabase
      .from(ASSIGN)
      .select('id, ih_code, device_type, sub_type, employee_name, status')
      .in('ih_code', chunk)
      .eq('center', fromCenter)
      .in('status', ['center_defective', 'unassigned'])
    if (data) matched.push(...data)
  }
  if (!matched.length) return 0

  await supabase.from(ASSIGN)
    .update({ status: 'returned', returned_at: now })
    .in('id', matched.map(m => m.id))

  await supabase.from(HIST).insert(matched.map(m => ({
    center: fromCenter,
    action: 'return',
    ih_code: m.ih_code,
    device_type: m.device_type,
    sub_type: m.sub_type,
    from_employee: m.employee_name,
    from_status: m.status,
    to_status: 'returned',
    acted_by: u.id,
    acted_by_name: u.name,
    acted_at: now,
  })))
  return matched.length
}

// ── 삭제 (단건 또는 업로드 배치) ───────────────────────────────────────────────
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  const p = perms(u)

  const body = await request.json()
  const id: string | undefined = body.id
  const uploadId: string | undefined = body.upload_id
  if (!id && !uploadId) return NextResponse.json({ error: 'id 또는 upload_id 필요' }, { status: 400 })

  // 권한: admin/자재센터 전체 / 그 외에는 본인 센터 업로드(in=출발센터, out=도착센터) 또는 업로더 본인
  const col = id ? 'id' : 'upload_id'
  const val = id ?? uploadId!
  const { data: rec } = await supabase.from(TERMINAL_TABLE)
    .select('uploaded_by, direction, from_center, to_center').eq(col, val).limit(1).single()
  if (!rec) return NextResponse.json({ error: '대상 없음' }, { status: 404 })
  const ownerCenter = rec.direction === 'in' ? rec.from_center : rec.to_center
  const owns = ownerCenter === p.center || rec.uploaded_by === u.id
  if (!p.isAdmin && !p.isJjae && !owns)
    return NextResponse.json({ error: '삭제 권한 없음' }, { status: 403 })

  const { error } = await supabase.from(TERMINAL_TABLE).delete().eq(col, val)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
