import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { CENTERS } from '@/constants/centers'

async function requireAdmin() {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') return null
  return session.user
}

type InRow = {
  item_name?: string
  quantity?: number | string
  location?: string
  rack_no?: string
  shelf?: string
  box_no?: string
  category_large?: string
  category_mid?: string
  category_small?: string
  erp_name?: string
  erp_code?: string
  notes?: string
}

const CENTER_SET = new Set<string>(CENTERS)
const s = (v: unknown) => {
  const t = String(v ?? '').trim()
  return t === '' ? null : t
}

// ── 재고 일괄 등록 ───────────────────────────────────────────────────────────
// 내보내기 CSV/엑셀 포맷의 행 배열을 받아 warehouse 에 일괄 insert (관리자 전용).
// 각 행 센터(location)는 행 값 → defaultCenter 순으로 결정, 유효 센터만 허용.
export async function POST(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { rows, defaultCenter } = await request.json() as { rows?: InRow[]; defaultCenter?: string }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '등록할 행이 없습니다.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const errors: string[] = []
  const records: Record<string, string | number | null>[] = []

  rows.forEach((r, i) => {
    const line = i + 2 // 헤더 1행 가정
    const name = s(r.item_name)
    if (!name) { errors.push(`${line}행: 자재명 누락`); return }

    const location = s(r.location) ?? (defaultCenter ?? null)
    if (!location) { errors.push(`${line}행(${name}): 센터 누락`); return }
    if (!CENTER_SET.has(location)) { errors.push(`${line}행(${name}): 알 수 없는 센터 "${location}"`); return }

    const qty = parseInt(String(r.quantity ?? 0)) || 0

    records.push({
      item_name:        name,
      quantity:         qty,
      location,
      rack_no:          s(r.rack_no),
      shelf:            s(r.shelf),
      box_no:           s(r.box_no),
      category_large:   s(r.category_large),
      category_mid:     s(r.category_mid),
      category_small:   s(r.category_small),
      erp_name:         s(r.erp_name),
      erp_code:         s(r.erp_code),
      notes:            s(r.notes),
      last_modified_by: admin.id,
      last_modified_at: now,
    })
  })

  if (records.length === 0) {
    return NextResponse.json({ error: '유효한 행이 없습니다.', errors }, { status: 400 })
  }

  const { error } = await supabase.from('warehouse').insert(records)
  if (error) return NextResponse.json({ error: error.message, errors }, { status: 500 })

  return NextResponse.json({ ok: true, inserted: records.length, errors })
}
