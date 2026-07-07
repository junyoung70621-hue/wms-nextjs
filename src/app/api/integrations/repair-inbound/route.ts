import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { classifyTaxi, normalizeTrcnId, TAXI_TABLE } from '@/lib/taxiTracking'
import { classifyTerminal, TERMINAL_TABLE } from '@/lib/terminal'
import { sendPushToCenters, sendPushToRoles, firePush } from '@/lib/push'

// ─────────────────────────────────────────────────────────────────────────────
// 수리센터(atec-repair) → WMS 연동 수신 엔드포인트
//
// 수리센터에서 "수리완료 등록"이 성공하면 이 엔드포인트로 단말기 1건(또는 배열)을 POST.
// WMS 가 기종을 분류해서 자재센터 재고로 귀속시킨다.
//   - 택시 → taxi_movements (direction=in, is_repair_done=true) → 📦 자재센터 보관 → 양품출고 가능
//   - 버스 → terminal_movements (from=리페어팀, to=자재센터, direction=in) 로 기록 보관
//            (버스 "자재센터 출고대기 풀" UI 는 다음 단계. 데이터는 file_name='수리센터연동' 으로 보존)
//   - NDF / 외부기관 → 귀속 제외(skipped)
//
// 인증: 헤더 x-api-key === process.env.REPAIR_INTEGRATION_KEY
// 멱등: 같은 (S/N, 수리일, direction=in) 이 이미 있으면 중복으로 건너뜀
// ─────────────────────────────────────────────────────────────────────────────

const REPAIR_SOURCE_TAG = '수리센터연동'
const REPAIR_FROM_CENTER = '리페어팀'
const REPAIR_TO_CENTER = '자재센터'

type Payload = {
  sn?: unknown
  category?: unknown
  repair_date?: unknown
  worker?: unknown
  is_ndf?: unknown
  source_id?: unknown
}

type ItemResult = {
  sn: string
  result: 'taxi_stored' | 'bus_stored' | 'skipped'
  reason?: 'ndf' | 'external' | 'duplicate' | 'empty_sn' | 'unknown_category'
  device_type?: string
}

// "택시"/"taxi" → taxi, "버스"/"bus" → bus, 그 외 → external
function routeOf(category: unknown): 'taxi' | 'bus' | 'external' {
  const c = String(category ?? '').trim().toLowerCase()
  if (c.includes('택시') || c.includes('taxi')) return 'taxi'
  if (c.includes('버스') || c.includes('bus')) return 'bus'
  return 'external'
}

function toDate(raw: unknown): string {
  const s = String(raw ?? '').trim()
  // YYYY-MM-DD 형태만 취함, 아니면 오늘(서버 기준)로 대체
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

// 이미 동일 수리완료 입고가 있는지 (멱등)
async function isTaxiDup(sn: string, date: string): Promise<boolean> {
  const { data } = await supabase.from(TAXI_TABLE)
    .select('id').eq('trcn_id', sn).eq('direction', 'in').eq('upload_date', date).limit(1)
  return !!data?.length
}
async function isBusDup(sn: string, date: string): Promise<boolean> {
  const { data } = await supabase.from(TERMINAL_TABLE)
    .select('id').eq('trcn_id', sn).eq('direction', 'in')
    .eq('to_center', REPAIR_TO_CENTER).eq('upload_date', date).limit(1)
  return !!data?.length
}

async function ingestOne(p: Payload): Promise<ItemResult> {
  const sn = normalizeTrcnId(p.sn)
  if (!sn) return { sn: '', result: 'skipped', reason: 'empty_sn' }

  if (p.is_ndf === true || String(p.is_ndf).toLowerCase() === 'true')
    return { sn, result: 'skipped', reason: 'ndf' }

  const route = routeOf(p.category)
  if (route === 'external') return { sn, result: 'skipped', reason: 'external' }

  const date = toDate(p.repair_date)
  const worker = String(p.worker ?? '').trim() || null
  const sourceId = String(p.source_id ?? '').trim() || null
  const notes = [`출처:${REPAIR_SOURCE_TAG}`, worker && `담당:${worker}`, sourceId && `repair_id:${sourceId}`]
    .filter(Boolean).join(' / ')
  const now = new Date().toISOString()

  if (route === 'taxi') {
    if (await isTaxiDup(sn, date)) return { sn, result: 'skipped', reason: 'duplicate' }
    const device = classifyTaxi(sn) // 미분류여도 그대로 기록(수리센터가 택시라고 확정한 건)
    const { error } = await supabase.from(TAXI_TABLE).insert({
      upload_id: crypto.randomUUID(),
      trcn_id: sn,
      device_type: device,
      direction: 'in',
      is_terminated: false,
      is_repair_done: true,       // 핵심: 수리완료 = 즉시 "📦 보관" 상태 → 양품출고 가능
      driver_name: null,
      uploaded_by: null,
      uploaded_at: now,
      upload_date: date,
      file_name: REPAIR_SOURCE_TAG,
      notes,
    })
    if (error) throw new Error(`taxi insert: ${error.message}`)
    return { sn, result: 'taxi_stored', device_type: device }
  }

  // bus
  if (await isBusDup(sn, date)) return { sn, result: 'skipped', reason: 'duplicate' }
  const { device, sub } = classifyTerminal(sn)
  const { error } = await supabase.from(TERMINAL_TABLE).insert({
    upload_id: crypto.randomUUID(),
    trcn_id: sn,
    device_type: device,
    sub_type: sub,
    from_center: REPAIR_FROM_CENTER,
    to_center: REPAIR_TO_CENTER,
    direction: 'in',
    uploaded_by: null,
    uploaded_at: now,
    upload_date: date,
    file_name: REPAIR_SOURCE_TAG,
    notes,
  })
  if (error) throw new Error(`bus insert: ${error.message}`)
  return { sn, result: 'bus_stored', device_type: device }
}

export async function POST(request: Request) {
  const expected = process.env.REPAIR_INTEGRATION_KEY
  if (!expected)
    return NextResponse.json({ error: '연동 키 미설정(REPAIR_INTEGRATION_KEY)' }, { status: 503 })

  const key = request.headers.get('x-api-key')
  if (key !== expected)
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON 파싱 실패' }, { status: 400 }) }

  // 단건 객체 또는 배열 / { items: [...] } 모두 허용
  const items: Payload[] = Array.isArray(body)
    ? (body as Payload[])
    : Array.isArray((body as { items?: unknown })?.items)
      ? ((body as { items: Payload[] }).items)
      : [body as Payload]

  if (!items.length) return NextResponse.json({ ok: true, results: [] })

  const results: ItemResult[] = []
  for (const it of items) {
    try { results.push(await ingestOne(it)) }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
  }

  // 귀속 성공분 알림 (자재센터 + admin). 실패는 본 응답을 막지 않음.
  const stored = results.filter(r => r.result === 'taxi_stored' || r.result === 'bus_stored')
  if (stored.length) {
    const taxiN = stored.filter(r => r.result === 'taxi_stored').length
    const busN = stored.filter(r => r.result === 'bus_stored').length
    const parts = [taxiN && `택시 ${taxiN}건`, busN && `버스 ${busN}건`].filter(Boolean).join(', ')
    const payload = {
      title: '수리완료 단말기 입고',
      body: `수리센터에서 ${parts} 자재센터로 귀속되었습니다.`,
      url: taxiN ? '/terminal/taxi' : '/bus-tracking',
      tag: 'repair-inbound',
    }
    firePush(sendPushToCenters([REPAIR_TO_CENTER], payload))
    firePush(sendPushToRoles(['admin'], payload))
  }

  const summary = {
    received: results.length,
    stored: stored.length,
    skipped: results.filter(r => r.result === 'skipped').length,
  }
  return NextResponse.json({ ok: true, summary, results })
}
