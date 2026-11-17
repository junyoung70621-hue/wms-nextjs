import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { classifyTerminal, normalizeTrcnId, TERMINAL_TABLE } from '@/lib/terminal'
import { BUS_CENTERS } from '@/constants/centers'
import { firePush, sendPushToCenters } from '@/lib/push'

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
  // 둘러보기 모드: 이동 목록은 익명 읽기 허용하되 IH(기기 시리얼)는 마스킹
  const session = await getSession()
  const anonymous = !session.user

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

  const list = (data ?? []) as unknown as Record<string, unknown>[]
  const rows = anonymous
    ? list.map(r => ({
        ...r,
        trcn_id: r.trcn_id
          ? String(r.trcn_id).slice(0, 3) + '*'.repeat(Math.max(0, String(r.trcn_id).length - 3))
          : r.trcn_id,
        file_name: null,
        notes: null,
      }))
    : list
  return NextResponse.json({ data: rows })
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
    return NextResponse.json({ inserted: 0, unclassified, dups: 0 })

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
    return NextResponse.json({ inserted: 0, unclassified, dups: dupSet.size })

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

  // 출고 시 도착 버스센터 인원에게 푸시
  if (direction === 'out' && BUS_CENTERS.includes(toCenter)) {
    const byDev: Record<string, number> = {}
    for (const r of toInsert) byDev[r.device] = (byDev[r.device] ?? 0) + 1
    const brk = Object.entries(byDev).map(([d, c]) => `${d} ${c}대`).join(' · ')
    firePush(sendPushToCenters([toCenter], {
      title: `${toCenter} 단말기 출고`,
      body: `버스단말기 ${toInsert.length}대가 ${toCenter}로 출고되었습니다.${brk ? `\n${brk}` : ''}`,
      url: '/terminal/bus',
      tag: `terminal-out-${toCenter}`,
    }))
  }

  return NextResponse.json({
    inserted: rows.length,
    unclassified,
    dups: dupSet.size,
  })
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
