import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

// 자재 추가 — 권한: admin 또는 자재센터 인원 전체(guest 제외).
// warehouse 테이블에 location/rack_no/shelf/box_no 와 함께 insert 하므로
// 자재창고지도(/rack-map, location 기준 조회)에 자동 연동된다.
function canAdd(u: { role: string; center: string; assigned_center: string | null }) {
  const center = u.assigned_center ?? u.center
  return u.role === 'admin' || (center === '자재센터' && u.role !== 'guest')
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  if (!canAdd(u)) return NextResponse.json({ error: '자재 추가 권한이 없습니다.' }, { status: 403 })

  const {
    item_name, quantity, location,
    rack_no, shelf, box_no,
    category_large, category_mid, category_small,
    erp_name, erp_code, notes,
  } = await request.json()

  if (!item_name?.trim() || !location) {
    return NextResponse.json({ error: '품명과 센터는 필수입니다.' }, { status: 400 })
  }

  const { error } = await supabase.from('warehouse').insert({
    item_name:        item_name.trim(),
    quantity:         quantity ?? 0,
    location,
    rack_no:          rack_no        || null,
    shelf:            shelf          || null,
    box_no:           box_no         || null,
    category_large:   category_large || null,
    category_mid:     category_mid   || null,
    category_small:   category_small || null,
    erp_name:         erp_name       || null,
    erp_code:         erp_code       || null,
    notes:            notes          || null,
    last_modified_by: u.id,
    last_modified_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
