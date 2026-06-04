import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import {
  computeTaxiStatus, TAXI_TABLE, TAXI_DELIVERY_TABLE, type TaxiMovement,
} from '@/lib/taxiTracking'

// 1000건씩 페이지네이션으로 전체 조회 (uploaded_at DESC 순서 보존)
async function fetchAll(direction: 'in' | 'out'): Promise<TaxiMovement[]> {
  const SELECT = 'id,upload_id,trcn_id,device_type,direction,is_terminated,is_repair_done,' +
                 'driver_name,uploaded_by,uploaded_at,upload_date,file_name,notes'
  const all: TaxiMovement[] = []
  const size = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(TAXI_TABLE).select(SELECT)
      .eq('direction', direction)
      .order('uploaded_at', { ascending: false })
      .range(from, from + size - 1)
    if (error) throw new Error(error.message)
    all.push(...((data ?? []) as unknown as TaxiMovement[]))
    if (!data || data.length < size) break
    from += size
  }
  return all
}

// trcn_id → 가장 최신 배송완료 키("배송날짜|배송시각"). 같은 키 비교로 최신 OUT 과 시간순 대조.
async function fetchLatestDeliveryMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const size = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(TAXI_DELIVERY_TABLE).select('trcn_id, delivery_date, delivered_at')
      .order('delivered_at', { ascending: false })
      .range(from, from + size - 1)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const k = `${r.delivery_date ?? ''}|${r.delivered_at ?? ''}`
      const cur = map.get(r.trcn_id)
      if (!cur || k > cur) map.set(r.trcn_id, k)
    }
    if (!data || data.length < size) break
    from += size
  }
  return map
}

// 현재 단말기 상태 스냅샷 (수리중 / 자재센터 보관 / 기사 보유 / 메트릭)
export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  try {
    const [ins, outs, latestDelivery] = await Promise.all([
      fetchAll('in'), fetchAll('out'), fetchLatestDeliveryMap(),
    ])
    return NextResponse.json(computeTaxiStatus(ins, outs, latestDelivery))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
