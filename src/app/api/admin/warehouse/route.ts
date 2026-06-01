import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

async function requireAdmin() {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') return null
  return session.user
}

// ── 자재 추가 ─────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

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
    item_name:       item_name.trim(),
    quantity:        quantity ?? 0,
    location,
    rack_no:         rack_no        || null,
    shelf:           shelf          || null,
    box_no:          box_no         || null,
    category_large:  category_large || null,
    category_mid:    category_mid   || null,
    category_small:  category_small || null,
    erp_name:        erp_name       || null,
    erp_code:        erp_code       || null,
    notes:           notes          || null,
    last_modified_by: admin.id,
    last_modified_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── 자재 삭제 ─────────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const { error } = await supabase.from('warehouse').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
