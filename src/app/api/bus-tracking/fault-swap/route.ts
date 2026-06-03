import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { classifyTerminal } from '@/lib/busTracking'
import { normIh } from '@/lib/faultSwap'

const TABLE = 'bus_terminal_assignments'
const HIST = 'bus_terminal_history'
// 보유로 간주하는 상태(불량 OLD가 걸려 있을 수 있는 상태들) + 미배정(센터보관)
const HELD_STATUSES = ['holding', 'defective', 'center_defective', 'exchanged', 'unassigned']

function nowKst() { return new Date(Date.now() + 9 * 3600000).toISOString() }

function canSwap(user: { role: string }) {
  return user.role === 'admin' || user.role === 'materials' || user.role === 'manager'
}

type Pair = { row: number; oldIh: string; newIh: string; raw: string }
type Match = {
  id: string; ih_code: string; center: string
  employee_id: string | null; employee_name: string | null; status: string
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  if (!canSwap(u)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await req.json()

  // ── 미리보기: OLD IH 보유자 매칭 ───────────────────────────────────────────────
  if (body.action === 'preview') {
    const pairs: Pair[] = body.pairs ?? []
    if (!pairs.length) return NextResponse.json({ data: [] })

    // 활성/보유 레코드 전체를 정규화 키로 매핑 (ih_code 표기 차이 흡수)
    const { data: rows } = await supabase.from(TABLE)
      .select('id,ih_code,center,employee_id,employee_name,status')
      .in('status', HELD_STATUSES)
      .limit(8000)
    const byNorm = new Map<string, Match[]>()
    for (const r of rows ?? []) {
      const k = normIh(r.ih_code)
      if (!k) continue
      if (!byNorm.has(k)) byNorm.set(k, [])
      byNorm.get(k)!.push(r as Match)
    }

    const data = pairs.map(p => {
      const matches = byNorm.get(normIh(p.oldIh)) ?? []
      const [od, os] = classifyTerminal(p.oldIh)
      const [nd, ns] = classifyTerminal(p.newIh)
      return {
        ...p,
        oldDevice: od === '미분류' ? '' : `${od} ${os}`,
        newDevice: nd === '미분류' ? '' : `${nd} ${ns}`,
        deviceMatch: od !== '미분류' && od === nd && os === ns,
        matches,
      }
    })
    return NextResponse.json({ data })
  }

  // ── 적용: OLD 보유 레코드 → 교체완료, NEW 양품 보유 신규 생성 + 이력 ───────────────
  if (body.action === 'apply') {
    const items: {
      recordId: string; oldIh: string; newIh: string
      center: string; employee_id: string | null; employee_name: string | null
      oldStatus: string
    }[] = body.items ?? []
    if (!items.length) return NextResponse.json({ ok: true, applied: 0 })

    const now = nowKst()
    let applied = 0
    const errors: string[] = []
    for (const it of items) {
      if (!it.recordId || !it.newIh) continue
      try {
        const [nd, ns] = classifyTerminal(it.newIh)
        const [od, os] = classifyTerminal(it.oldIh)
        const newStatus = it.employee_id ? 'holding' : 'unassigned' // 직원 보유 vs 센터보관

        // 1) 불량(OLD) 보유 레코드 → 교체완료
        await supabase.from(TABLE).update({ status: 'exchanged', returned_at: now }).eq('id', it.recordId)
        // 2) 신규(NEW) 양품 보유 레코드 생성 (동일 보유자/센터)
        await supabase.from(TABLE).insert({
          ih_code: it.newIh,
          device_type: nd !== '미분류' ? nd : null,
          sub_type: nd !== '미분류' ? ns : null,
          center: it.center,
          employee_id: it.employee_id ?? null,
          employee_name: it.employee_name ?? null,
          assigned_at: now, assigned_by: u.id, status: newStatus,
        })
        // 3) 변경이력 (swap)
        await supabase.from(HIST).insert({
          center: it.center, action: 'swap', ih_code: it.oldIh,
          device_type: od !== '미분류' ? od : null,
          sub_type: od !== '미분류' ? os : null,
          from_employee: it.employee_name ?? null,
          from_status: it.oldStatus ?? null, to_status: 'exchanged',
          extra_ih: it.newIh, acted_by: u.id, acted_by_name: u.name, acted_at: now,
        })
        applied++
      } catch (e) {
        errors.push(`${it.oldIh}→${it.newIh}: ${(e as Error).message}`)
      }
    }
    return NextResponse.json({ ok: true, applied, errors })
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
}
