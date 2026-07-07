import { supabase } from '@/lib/supabase'
import GuestCallout from './GuestCallout'

// 게스트용 자재요청/구매요청 미리보기 — 실제 데이터를 보여주되 숫자·품명만 블러
// (서버 컴포넌트에서 직접 조회하므로 공개 API를 열지 않는다. 클릭은 셸 오버레이가 로그인 팝업으로 가로챔)

const MAT_STATUS: Record<string, string> = {
  pending: '⏳ 대기중', approved: '✅ 승인', rejected: '❌ 거절', on_hold: '⏸️ 보류', cancelled: '🚫 취소됨',
}
const PUR_STATUS: Record<string, string> = {
  pending: '⏳ 대기중', in_progress: '🔄 처리중', completed: '✅ 완료', rejected: '❌ 거절', cancelled: '🚫 취소됨',
}

type Row = { date: string; item: string; qty: string; center: string; status: string }

function day(ts: string | null): string {
  return ts ? String(ts).slice(0, 10) : ''
}

function summarize(names: string[]): string {
  if (names.length === 0) return '-'
  return names.length > 1 ? `${names[0]} 외 ${names.length - 1}건` : names[0]
}

async function fetchRows(kind: 'material' | 'purchase'): Promise<Row[]> {
  if (kind === 'material') {
    const { data } = await supabase
      .from('material_requests')
      .select('items, from_center, requested_at, status')
      .order('requested_at', { ascending: false })
      .limit(12)
    return (data ?? []).map(r => {
      const items = (r.items ?? []) as { item_name?: string; requested_qty?: number }[]
      return {
        date: day(r.requested_at),
        item: summarize(items.map(i => i.item_name ?? '').filter(Boolean)),
        qty: String(items.reduce((s, i) => s + (Number(i.requested_qty) || 0), 0)),
        center: r.from_center ?? '',
        status: MAT_STATUS[r.status] ?? r.status,
      }
    })
  }
  const { data } = await supabase
    .from('purchase_requests')
    .select('items, requester_center, requested_at, status')
    .order('requested_at', { ascending: false })
    .limit(12)
  return (data ?? []).map(r => {
    const items = (r.items ?? []) as { 품명?: string; 수량?: number }[]
    return {
      date: day(r.requested_at),
      item: summarize(items.map(i => i.품명 ?? '').filter(Boolean)),
      qty: String(items.reduce((s, i) => s + (Number(i.수량) || 0), 0)),
      center: r.requester_center ?? '',
      status: PUR_STATUS[r.status] ?? r.status,
    }
  })
}

export default async function GuestRequestsPreview({ kind }: { kind: 'material' | 'purchase' }) {
  let rows: Row[] = []
  try {
    rows = await fetchRows(kind)
  } catch {
    rows = []
  }

  const itemLabel = kind === 'material' ? '자재명' : '품명'

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <span className="text-[13px] font-bold text-[#1E293B]">
          {kind === 'material' ? '📋 최근 자재요청' : '🛒 최근 구매요청'}
        </span>
        <GuestCallout label={kind === 'material' ? '로그인 후 자재요청 작성·승인 처리' : '로그인 후 구매요청 작성·진행 관리'} />
      </div>
      {/* 실제 요청 목록 — 품명·수량만 블러(guest-veil), 날짜·센터·상태는 data-guest-clear */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[#e2e8f0] bg-[#f8f9ff]">
              <th className="px-3 py-2.5 text-left font-semibold text-[#475569] whitespace-nowrap">요청일</th>
              <th className="px-3 py-2.5 text-left font-semibold text-[#475569] whitespace-nowrap">{itemLabel}</th>
              <th className="px-3 py-2.5 text-left font-semibold text-[#475569] whitespace-nowrap">수량</th>
              <th className="px-3 py-2.5 text-left font-semibold text-[#475569] whitespace-nowrap">요청센터</th>
              <th className="px-3 py-2.5 text-left font-semibold text-[#475569] whitespace-nowrap">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td data-guest-clear colSpan={5} className="px-3 py-8 text-center text-[#94A3B8]">
                  표시할 요청이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-b border-[#f1f5f9] last:border-0">
                  <td data-guest-clear className="px-3 py-2.5 whitespace-nowrap text-[#334155]">{r.date}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[#334155]">{r.item}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[#334155]">{r.qty}</td>
                  <td data-guest-clear className="px-3 py-2.5 whitespace-nowrap text-[#334155]">{r.center}</td>
                  <td data-guest-clear className="px-3 py-2.5 whitespace-nowrap text-[#334155]">{r.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
