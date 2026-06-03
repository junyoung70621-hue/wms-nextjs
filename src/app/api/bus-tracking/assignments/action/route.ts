import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { classifyTerminal } from '@/lib/busTracking'

const TABLE = 'bus_terminal_assignments'
const HIST  = 'bus_terminal_history'

function nowKst() { return new Date(Date.now() + 9 * 3600000).toISOString() }

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  const body = await req.json()
  const { action } = body
  const now = nowKst()

  // ── swap: 불량 교체 ──────────────────────────────────────────────────────────
  if (action === 'swap') {
    const { holding_id, defective_ih, center, employee_id, employee_name,
            orig_ih, orig_status, orig_dtype, orig_stype } = body
    if (!holding_id || !defective_ih) return NextResponse.json({ error: '필수값 누락' }, { status: 400 })

    await supabase.from(TABLE).update({ status: 'exchanged', returned_at: now }).eq('id', holding_id)

    let def_dtype = orig_dtype || ''
    let def_stype = orig_stype || ''
    if (!def_dtype) {
      const [d, s] = classifyTerminal(defective_ih)
      if (d !== '미분류') { def_dtype = d; def_stype = s }
    }

    await supabase.from(TABLE).insert({
      ih_code: defective_ih, device_type: def_dtype || null, sub_type: def_stype || null,
      center, employee_id: employee_id || u.id, employee_name,
      assigned_at: now, assigned_by: u.id, status: 'defective',
    })

    await supabase.from(HIST).insert({
      center, action: 'swap', ih_code: orig_ih,
      device_type: orig_dtype || null, sub_type: orig_stype || null,
      from_employee: employee_name, from_status: orig_status, to_status: 'exchanged',
      extra_ih: defective_ih, acted_by: u.id, acted_by_name: u.name, acted_at: now,
    })
    return NextResponse.json({ ok: true })
  }

  // ── transfer: 직원 이동 ──────────────────────────────────────────────────────
  if (action === 'transfer') {
    const { ids, center, target_id, target_name, records_meta } = body
    if (!ids?.length) return NextResponse.json({ error: 'ids 필요' }, { status: 400 })

    await supabase.from(TABLE).update({
      employee_id: target_id, employee_name: target_name,
      assigned_at: now, assigned_by: u.id,
    }).in('id', ids)

    if (records_meta?.length) {
      await supabase.from(HIST).insert(records_meta.map((r: { ih_code: string; device_type?: string; sub_type?: string; employee_name?: string; status?: string }) => ({
        center, action: 'transfer', ih_code: r.ih_code,
        device_type: r.device_type ?? null, sub_type: r.sub_type ?? null,
        from_employee: r.employee_name, to_employee: target_name,
        from_status: r.status, to_status: r.status,
        acted_by: u.id, acted_by_name: u.name, acted_at: now,
      })))
    }
    return NextResponse.json({ ok: true })
  }

  // ── return: 반납 ────────────────────────────────────────────────────────────
  if (action === 'return') {
    const { ids, records_meta } = body
    if (!ids?.length) return NextResponse.json({ error: 'ids 필요' }, { status: 400 })

    await supabase.from(TABLE).update({ status: 'returned', returned_at: now })
      .in('id', ids).eq('status', 'holding')
    await supabase.from(TABLE).update({ status: 'center_defective', returned_at: now })
      .in('id', ids).eq('status', 'defective')

    if (records_meta?.length) {
      await supabase.from(HIST).insert(records_meta.map((r: { ih_code: string; device_type?: string; sub_type?: string; employee_name?: string; status?: string; center?: string }) => ({
        center: r.center, action: 'return', ih_code: r.ih_code,
        device_type: r.device_type ?? null, sub_type: r.sub_type ?? null,
        from_employee: r.employee_name,
        from_status: r.status,
        to_status: r.status === 'holding' ? 'returned' : 'center_defective',
        acted_by: u.id, acted_by_name: u.name, acted_at: now,
      })))
    }
    return NextResponse.json({ ok: true })
  }

  // ── edit: 레코드 수정 ────────────────────────────────────────────────────────
  if (action === 'edit') {
    const { id, ih_code, device_type, sub_type, employee_id, employee_name, status: newStatus } = body
    if (!id || !ih_code) return NextResponse.json({ error: '필수값 누락' }, { status: 400 })

    await supabase.from(TABLE).update({
      ih_code: ih_code.trim(),
      device_type: device_type || null,
      sub_type: sub_type || null,
      employee_id: employee_id || null,
      employee_name,
      status: newStatus,
    }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // ── bulk_register: 일괄 등록 ─────────────────────────────────────────────────
  if (action === 'bulk_register') {
    const { records, clear_centers } = body
    if (!records?.length) return NextResponse.json({ error: 'records 필요' }, { status: 400 })

    if (clear_centers?.length) {
      // 완전초기화: 대상 센터의 모든 상태(보유/불량/교체완료/반납/미배정) 레코드 삭제.
      // 변경이력(bus_terminal_history)은 별도 테이블이라 보존됨.
      await supabase.from(TABLE).delete().in('center', clear_centers)
    }

    await supabase.from(TABLE).insert(records)
    await supabase.from(HIST).insert(records.map((r: { center: string; ih_code: string; device_type?: string; sub_type?: string; employee_name?: string }) => ({
      center: r.center, action: 'init', ih_code: r.ih_code,
      device_type: r.device_type ?? null, sub_type: r.sub_type ?? null,
      to_employee: r.employee_name, to_status: 'holding',
      acted_by: u.id, acted_by_name: u.name, acted_at: now,
    })))
    return NextResponse.json({ ok: true, count: records.length })
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
}
