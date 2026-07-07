import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { TERMINAL_TABLE } from '@/lib/terminal'

// ─────────────────────────────────────────────────────────────────────────────
// 버스 수리완료 출고대기 풀
//
// 수리센터 연동으로 자재센터에 귀속된 버스단말기(terminal_movements:
//   direction=in, to_center=자재센터, file_name='수리센터연동') 중
// 아직 타센터로 출고되지 않은 것만 반환한다.
//
// "출고됨" 판정: 자재센터발 출고(direction=out, from_center=자재센터)가
//   수리완료 입고일(upload_date) 이상 날짜로 존재하면 제외.
//   (출고는 기존 /api/terminal/movements POST 로 처리 → 같은 날 출고하면 풀에서 빠짐)
// ─────────────────────────────────────────────────────────────────────────────

const HUB = '자재센터'
const SOURCE_TAG = '수리센터연동'

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  // 1) 수리완료 입고분
  const { data: ins, error } = await supabase.from(TERMINAL_TABLE)
    .select('id,trcn_id,device_type,sub_type,upload_date,uploaded_at,notes')
    .eq('direction', 'in').eq('to_center', HUB).eq('file_name', SOURCE_TAG)
    .order('uploaded_at', { ascending: false })
    .limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // trcn_id별 최신 입고 1건
  const latestIn = new Map<string, { trcn_id: string; device_type: string; sub_type: string; upload_date: string; uploaded_at: string; notes: string | null }>()
  for (const r of ins ?? []) {
    if (!latestIn.has(r.trcn_id)) latestIn.set(r.trcn_id, r)
  }
  if (!latestIn.size) return NextResponse.json({ data: [] })

  // 2) 자재센터발 출고 — trcn_id별 최신 출고일
  const trcnIds = [...latestIn.keys()]
  const latestOutDate = new Map<string, string>()
  for (let i = 0; i < trcnIds.length; i += 200) {
    const chunk = trcnIds.slice(i, i + 200)
    const { data: outs } = await supabase.from(TERMINAL_TABLE)
      .select('trcn_id,upload_date')
      .eq('direction', 'out').eq('from_center', HUB).in('trcn_id', chunk)
    for (const r of outs ?? []) {
      const cur = latestOutDate.get(r.trcn_id)
      if (!cur || r.upload_date > cur) latestOutDate.set(r.trcn_id, r.upload_date)
    }
  }

  // 3) 출고된 것 제외 (출고일 >= 수리완료 입고일)
  const data = [...latestIn.values()]
    .filter(r => {
      const out = latestOutDate.get(r.trcn_id)
      return !out || out < r.upload_date
    })
    .map(r => {
      const worker = /담당:([^/]+)/.exec(r.notes ?? '')?.[1]?.trim() || null
      return {
        ih_code: r.trcn_id,
        device_type: r.device_type,
        sub_type: r.sub_type,
        repair_date: r.upload_date,
        worker,
      }
    })
    .sort((a, b) =>
      b.repair_date.localeCompare(a.repair_date) ||
      a.ih_code.localeCompare(b.ih_code, 'ko', { numeric: true }))

  return NextResponse.json({ data })
}
