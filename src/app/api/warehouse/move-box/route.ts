import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { adjustStock } from '@/lib/stock'

const COLS = 'id, item_name, location, rack_no, shelf, box_no, category_large, category_mid, category_small, erp_name, erp_code, notes'
const norm = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// POST: 같은 자재명 박스 간 수량 이동 (예: 13-3 랙 11번 박스 → 14-1 랙 2번 박스)
//  - to_id: 같은 자재명이 이미 있는 박스로 이동
//  - to: { rack_no, shelf, box_no } 새 박스로 분할 (그 위치에 같은 자재가 있으면 거기에 합침)
export async function POST(request: Request) {
  const session = await getSession()
  const u = session.user
  // 수정 권한: 관리자 / 자재센터 직원(guest 제외) — 자재 수정과 동일 기준
  if (!u || !(u.role === 'admin' || ((u.assigned_center ?? u.center) === '자재센터' && u.role !== 'guest'))) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { from_id, to_id, to, quantity } = await request.json()
  if (!from_id || (!to_id && !to) || !Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: '이동할 박스와 수량(1 이상)을 확인해 주세요.' }, { status: 400 })
  }

  const { data: src } = await supabase.from('warehouse').select(COLS).eq('id', from_id).single()
  if (!src) return NextResponse.json({ error: '자재 없음' }, { status: 404 })
  // 단말기 박스 수량은 IH(box_terminals) 개수와 연동 → 수량만 옮기면 불일치
  if (src.category_mid === '단말기') {
    return NextResponse.json({ error: '단말기 박스는 IH 단위로 이동해 주세요.' }, { status: 400 })
  }

  // 도착 박스 결정
  let dst: typeof src | null = null
  let newCoord: { rack_no: string | null; shelf: string | null; box_no: string | null } | null = null
  if (to_id) {
    const { data } = await supabase.from('warehouse').select(COLS).eq('id', to_id).single()
    dst = data
    if (!dst) return NextResponse.json({ error: '도착 박스 없음' }, { status: 404 })
  } else {
    newCoord = { rack_no: norm(to.rack_no), shelf: norm(to.shelf), box_no: norm(to.box_no) }
    if (!newCoord.rack_no || !newCoord.box_no) {
      return NextResponse.json({ error: '새 박스의 랙과 박스 번호를 입력해 주세요.' }, { status: 400 })
    }
    let q = supabase.from('warehouse').select(COLS)
      .eq('location', src.location).eq('item_name', src.item_name)
      .eq('rack_no', newCoord.rack_no).eq('box_no', newCoord.box_no)
    q = newCoord.shelf ? q.eq('shelf', newCoord.shelf) : q.is('shelf', null)
    const { data } = await q.limit(1)
    dst = data?.[0] ?? null // 이미 같은 자재가 있으면 거기에 합침
  }

  if (dst) {
    if (dst.id === src.id) return NextResponse.json({ error: '같은 박스입니다.' }, { status: 400 })
    if (dst.item_name.trim() !== src.item_name.trim() || dst.location !== src.location) {
      return NextResponse.json({ error: '같은 센터의 같은 자재명 박스로만 이동할 수 있습니다.' }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  const extra = { last_modified_by: u.id, last_modified_at: now }
  const out = await adjustStock(src.id, -quantity, extra)
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 })

  let dstId: number, before: number, after: number
  if (dst) {
    const inn = await adjustStock(dst.id, quantity, extra)
    if (!inn.ok) {
      await adjustStock(src.id, quantity) // 출발 박스 원복
      return NextResponse.json({ error: inn.error }, { status: 500 })
    }
    dstId = dst.id; before = inn.before; after = inn.after
  } else {
    // 새 박스: 출발 자재 정보를 복사해 새 행 생성
    const { id: _id, ...base } = src
    void _id
    const { data: created, error } = await supabase.from('warehouse')
      .insert({ ...base, ...newCoord, quantity, ...extra }).select('id').single()
    if (error || !created) {
      await adjustStock(src.id, quantity) // 출발 박스 원복
      return NextResponse.json({ error: error?.message ?? '새 박스 생성 실패' }, { status: 500 })
    }
    dstId = created.id; before = 0; after = quantity
  }

  const d = dst ?? { ...src, ...newCoord! }
  const pos = (r: { rack_no: string | null; shelf: string | null; box_no: string | null }) =>
    `${r.rack_no ?? '-'}랙 ${r.shelf ?? '-'}선반 ${r.box_no ?? '-'}박스`
  const reason = `박스 이동${dst ? '' : '(새 박스)'}: ${pos(src)} → ${pos(d)}`
  await supabase.from('history').insert([
    { actor_id: u.id, item_id: src.id, action_type: 'transfer', quantity, reason,
      from_center: src.location, to_center: src.location, snapshot_qty_before: out.before, snapshot_qty_after: out.after },
    { actor_id: u.id, item_id: dstId, action_type: 'transfer', quantity, reason,
      from_center: src.location, to_center: src.location, snapshot_qty_before: before, snapshot_qty_after: after },
  ])

  return NextResponse.json({ ok: true })
}
