import { supabase } from './supabase'

// warehouse.quantity 증감을 CAS(읽은 값과 같을 때만 UPDATE)로 처리해
// 동시 요청 간 차감 유실/초과 출고를 막는다. 충돌 시 3회 재시도.
// ponytail: CAS 재시도 방식 — 충돌이 잦아지면 Postgres RPC(원자 UPDATE)로 교체
export async function adjustStock(
  itemId: number,
  delta: number,
  extra: Record<string, unknown> = {},
): Promise<{ ok: true; before: number; after: number } | { ok: false; error: string }> {
  for (let i = 0; i < 3; i++) {
    const { data: item, error } = await supabase
      .from('warehouse').select('quantity').eq('id', itemId).single()
    if (error || !item) return { ok: false, error: '자재 없음' }

    const before = item.quantity ?? 0
    const after = before + delta
    if (after < 0) return { ok: false, error: `재고 부족 (현재 ${before}개)` }

    let q = supabase.from('warehouse').update({ quantity: after, ...extra }).eq('id', itemId)
    q = item.quantity === null ? q.is('quantity', null) : q.eq('quantity', item.quantity)
    const { data: updated, error: upErr } = await q.select('id')
    if (upErr) return { ok: false, error: upErr.message }
    if (updated?.length) return { ok: true, before, after }
    // 다른 요청이 먼저 수정함 → 재시도
  }
  return { ok: false, error: '동시 수정 충돌 — 다시 시도해 주세요' }
}

// 박스(warehouse) 수량을 delta 만큼 증감 (0 미만은 0으로 클램프). CAS 재시도.
export async function adjustBoxQuantity(warehouseId: number | null, delta: number) {
  if (!warehouseId || !delta) return
  for (let i = 0; i < 3; i++) {
    const { data } = await supabase.from('warehouse').select('quantity').eq('id', warehouseId).single()
    if (!data) return
    const next = Math.max(0, (data.quantity ?? 0) + delta)
    let q = supabase.from('warehouse').update({ quantity: next }).eq('id', warehouseId)
    q = data.quantity === null ? q.is('quantity', null) : q.eq('quantity', data.quantity)
    const { data: updated } = await q.select('id')
    if (updated?.length) return
  }
}
