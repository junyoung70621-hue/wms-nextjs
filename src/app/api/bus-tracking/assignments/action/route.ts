import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { classifyTerminal } from '@/lib/busTracking'

const TABLE = 'bus_terminal_assignments'
const HIST  = 'bus_terminal_history'
const RESET = 'bus_terminal_resets'

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
            orig_ih, orig_status, orig_dtype, orig_stype, same_ih } = body
    if (!holding_id || !defective_ih) return NextResponse.json({ error: '필수값 누락' }, { status: 400 })

    // 양품불량(동일 IH): 들고나간 양품 단말기 자체가 불량인 경우.
    // 새 레코드 없이 같은 IH 보유분을 양품→불량으로 상태만 변경(직원 보유 유지).
    if (same_ih) {
      await supabase.from(TABLE).update({ status: 'defective' }).eq('id', holding_id)
      // 이력은 동일 IH 양품→불량 상태변경으로 기록. action은 DB CHECK 제약상 'swap' 사용
      // (extra_ih 없음 + from/to 상태로 일반 교체와 구분됨).
      await supabase.from(HIST).insert({
        center, action: 'swap', ih_code: orig_ih,
        device_type: orig_dtype || null, sub_type: orig_stype || null,
        from_employee: employee_name, to_employee: employee_name,
        from_status: orig_status, to_status: 'defective',
        acted_by: u.id, acted_by_name: u.name, acted_at: now,
      })
      return NextResponse.json({ ok: true })
    }

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
      // 출고풀 초기화: terminal_movements(출고)는 다른 페이지와 공유되는 원본이라
      // 삭제하지 않는 대신, 센터별 '초기화 기준시각'을 기록한다. 센터 보유현황의
      // 출고풀은 이 시각 이후 출고분만 표시하므로, 초기화 이전 출고는 더 이상 뜨지 않는다.
      // reset_at은 terminal_movements.uploaded_at과 비교한다. uploaded_at도 nowKst()
      // (KST를 +00:00으로 라벨링한 보정 시각)로 저장되므로, 기본값은 now(KST)를 쓴다.
      //
      // ※ 순서 실수 방지: 초기화 직전(같은 날) 올린 출고 스냅샷까지 가려지지 않도록,
      //   해당 센터의 '오늘 업로드된 출고' 중 가장 이른 시각 1초 전으로 기준선을 낮춘다.
      //   → 오늘 올린 출고는 모두 표시되고, 과거 출고만 숨겨진다.
      const todayKst = now.slice(0, 10) // YYYY-MM-DD (nowKst 기준일)
      const resetRows: { center: string; reset_at: string }[] = []
      for (const c of clear_centers as string[]) {
        const { data: todayOut } = await supabase.from('terminal_movements')
          .select('uploaded_at')
          .eq('direction', 'out').eq('to_center', c)
          .gte('uploaded_at', `${todayKst}T00:00:00+00:00`)
          .order('uploaded_at', { ascending: true }).limit(1)
        const earliest = todayOut?.[0]?.uploaded_at
        const resetAt = earliest
          ? new Date(new Date(earliest).getTime() - 1000).toISOString()
          : now
        resetRows.push({ center: c, reset_at: resetAt })
      }
      await supabase.from(RESET).upsert(resetRows, { onConflict: 'center' })
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
