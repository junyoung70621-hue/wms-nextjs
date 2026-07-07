'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { SessionUser } from '@/lib/session'
import GuestCallout from '@/components/auth/GuestCallout'

type Summary = {
  total_items: number
  total_qty: number
  mat_pending: number
  pur_pending: number
  tr_pending: number
  zero_stock: number
}

type CenterRow = {
  center: string
  items: number
  total_qty: number
  zero: number
}

type HistoryRow = {
  id: number
  action_type: string
  quantity: number
  reason: string | null
  from_center: string | null
  to_center: string | null
  acted_at: string
  warehouse: { item_name: string; location: string } | null
  users: { name: string } | null
}

type ZeroItem = {
  id: number
  item_name: string
  location: string
  category_large: string | null
}

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  in:       { label: '입고', color: '#2e7d32' },
  out:      { label: '출고', color: '#c62828' },
  transfer: { label: '이동', color: '#1565c0' },
  adjust:   { label: '조정', color: '#f57c00' },
  edit:     { label: '수정', color: '#7c3aed' },
}

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 3600 * 1000)
      .toISOString().slice(0, 16).replace('T', ' ')
  } catch { return ts.slice(0, 16).replace('T', ' ') }
}

function StatCard({
  label, value, sub, href, color, alert,
}: {
  label: string
  value: string | number
  sub?: string
  href?: string
  color?: string
  alert?: boolean
}) {
  const inner = (
    <div
      className={`bg-white rounded-lg border p-4 flex flex-col gap-1 hover:shadow-sm transition-shadow ${
        alert ? 'border-l-[3px] border-red-300 bg-red-50' : 'border-[rgba(0,0,0,0.08)]'
      }`}
      style={!alert && color ? { borderLeftWidth: 3, borderLeftColor: color } : {}}
    >
      <span className="text-[11px] text-[#64748B] font-medium tracking-wide uppercase">{label}</span>
      <span
        data-guest-blur
        className="text-[28px] font-bold leading-none"
        style={{ color: alert ? '#c62828' : (color ?? '#1E293B') }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {sub && <span className="text-[11px] text-[#94A3B8]">{sub}</span>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

export default function DashboardContent({ user }: { user: SessionUser }) {
  const [summary,      setSummary]      = useState<Summary | null>(null)
  const [centers,      setCenters]      = useState<CenterRow[]>([])
  const [history,      setHistory]      = useState<HistoryRow[]>([])
  const [zeroItems,    setZeroItems]    = useState<ZeroItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [unapproved,   setUnapproved]   = useState(0)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setSummary(d.summary)
        setCenters(d.centers)
        setHistory(d.history)
        setZeroItems(d.zero_stock_items ?? [])
      })
      .catch(() => setError('데이터 로드 실패'))
      .finally(() => setLoading(false))

    if (user.role === 'admin') {
      fetch('/api/admin/users')
        .then(r => r.json())
        .then(d => {
          if (!d.error) {
            setUnapproved((d.data as Array<{ is_approved: boolean }>).filter(u => !u.is_approved).length)
          }
        })
        .catch(() => {})
    }
  }, [user.role])

  const isManager = user.role === 'admin' || user.role === 'materials'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-[#94A3B8] text-sm">
        불러오는 중...
      </div>
    )
  }

  if (error) {
    return <div className="text-red-500 text-sm p-4">{error}</div>
  }

  const hasPendingAlerts =
    (summary?.mat_pending ?? 0) > 0 ||
    (summary?.pur_pending ?? 0) > 0 ||
    (summary?.tr_pending  ?? 0) > 0

  return (
    <div className="space-y-5">
      {/* 미승인 계정 알림 (admin) */}
      {user.role === 'admin' && unapproved > 0 && (
        <Link href="/admin">
          <div className="flex items-center gap-3 px-4 py-3 bg-[#fff8e1] border border-[#f57c00] rounded-lg hover:bg-[#fff3cd] transition-colors cursor-pointer">
            <span className="text-[18px]">⚠️</span>
            <div>
              <span className="text-[13px] font-bold text-[#f57c00]">미승인 계정 {unapproved}명</span>
              <span className="text-[12px] text-[#e65100] ml-2">관리자 페이지에서 확인하세요.</span>
            </div>
          </div>
        </Link>
      )}

      {/* 요약 카드 6개 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="자재 종류"    value={summary?.total_items ?? 0} sub="등록 품목 수"   href="/warehouse"          color="#B32646" />
        <StatCard label="총 재고량"    value={summary?.total_qty   ?? 0} sub="전체 수량 합계" href="/warehouse"          color="#1565c0" />
        <StatCard label="재고 없음"    value={summary?.zero_stock  ?? 0} sub="수량 0 품목"    href="/warehouse"
          alert={(summary?.zero_stock ?? 0) > 0} color="#94A3B8" />
        <StatCard label="대기 자재요청" value={summary?.mat_pending ?? 0} sub="처리 대기"      href="/material-requests"
          color={(summary?.mat_pending ?? 0) > 0 ? '#f57c00' : '#94A3B8'} />
        <StatCard label="대기 구매요청" value={summary?.pur_pending ?? 0} sub="처리 대기"      href="/purchase-requests"
          color={(summary?.pur_pending ?? 0) > 0 ? '#f57c00' : '#94A3B8'} />
        <StatCard label="대기 이동신청" value={summary?.tr_pending  ?? 0} sub="처리 대기"      href="/warehouse"
          color={(summary?.tr_pending  ?? 0) > 0 ? '#f57c00' : '#94A3B8'} />
      </div>

      {/* 처리 대기 배너 */}
      {isManager && hasPendingAlerts && (
        <div className="flex flex-wrap gap-2">
          {(summary?.mat_pending ?? 0) > 0 && (
            <Link href="/material-requests">
              <span className="inline-flex items-center gap-1 bg-[#fff3e0] border border-[#f57c00] text-[#e65100] text-[12px] font-medium px-3 py-1.5 rounded-full hover:bg-[#ffe0b2] transition-colors">
                📦 자재요청 {summary!.mat_pending}건 대기
              </span>
            </Link>
          )}
          {(summary?.pur_pending ?? 0) > 0 && (
            <Link href="/purchase-requests">
              <span className="inline-flex items-center gap-1 bg-[#fff3e0] border border-[#f57c00] text-[#e65100] text-[12px] font-medium px-3 py-1.5 rounded-full hover:bg-[#ffe0b2] transition-colors">
                🛒 구매요청 {summary!.pur_pending}건 대기
              </span>
            </Link>
          )}
          {(summary?.tr_pending ?? 0) > 0 && (
            <Link href="/warehouse">
              <span className="inline-flex items-center gap-1 bg-[#fff3e0] border border-[#f57c00] text-[#e65100] text-[12px] font-medium px-3 py-1.5 rounded-full hover:bg-[#ffe0b2] transition-colors">
                🚚 이동신청 {summary!.tr_pending}건 대기
              </span>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 센터별 재고 현황 */}
        <div className="lg:col-span-1 bg-white rounded-lg border border-[#e2e8f0] overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1E293B]">
              {isManager ? '센터별 재고' : '내 센터 재고'}<GuestCallout label="상세 → 재고 현황으로 이동" />
            </span>
            <Link href="/warehouse" className="text-[11px] text-[#B32646] hover:underline">
              상세 →
            </Link>
          </div>
          {centers.length === 0 ? (
            <div className="px-4 py-6 text-[12px] text-[#94A3B8] text-center">데이터 없음</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#F8F9FA] text-[#64748B]">
                  <th className="px-3 py-2 text-left font-medium">센터</th>
                  <th className="px-3 py-2 text-right font-medium">품목</th>
                  <th className="px-3 py-2 text-right font-medium">수량</th>
                  <th className="px-3 py-2 text-right font-medium text-red-400">재고없음</th>
                </tr>
              </thead>
              <tbody>
                {centers.map((c, i) => (
                  <tr key={c.center} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                    <td data-guest-clear className="px-3 py-2 font-medium text-[#1E293B]">{c.center}</td>
                    <td className="px-3 py-2 text-right text-[#475569]">{c.items.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[#475569]">{c.total_qty.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-right font-bold ${c.zero > 0 ? 'text-red-500' : 'text-[#CBD5E1]'}`}>
                      {c.zero > 0 ? c.zero : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 최근 입출고 */}
        <div className="lg:col-span-1 bg-white rounded-lg border border-[#e2e8f0] overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1E293B]">최근 입출고<GuestCallout label="전체 → 입출고 이력 보기" /></span>
            <Link href="/history" className="text-[11px] text-[#B32646] hover:underline">
              전체 →
            </Link>
          </div>
          {history.length === 0 ? (
            <div className="px-4 py-6 text-[12px] text-[#94A3B8] text-center">이력 없음</div>
          ) : (
            <div className="divide-y divide-[rgba(0,0,0,0.05)]">
              {history.map(h => {
                const act = ACTION_LABEL[h.action_type] ?? { label: h.action_type, color: '#555' }
                const itemName = h.warehouse?.item_name ?? '-'
                const location = h.warehouse?.location ?? (h.from_center ?? h.to_center ?? '-')
                const actor = h.users?.name ?? '-'
                return (
                  <div key={h.id} className="px-3 py-2 flex items-center gap-2">
                    <span
                      className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: act.color, background: act.color + '18' }}
                    >
                      {act.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div data-guest-blur className="text-[12px] font-medium text-[#1E293B] truncate">{itemName}</div>
                      <div className="text-[10px] text-[#94A3B8]">
                        {location} · {actor} · <span data-guest-blur>{h.quantity.toLocaleString()}개</span>
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-[10px] text-[#CBD5E1]">
                      {tsKst(h.acted_at).slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 재고 없는 품목 */}
        <div className="lg:col-span-1 bg-white rounded-lg border border-[#e2e8f0] overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1E293B]">
              📭 재고 없는 품목
              {(summary?.zero_stock ?? 0) > 10 && (
                <span className="ml-1 text-[10px] text-[#94A3B8]">(상위 10개)</span>
              )}
            </span>
            {(summary?.zero_stock ?? 0) > 0 && (
              <span data-guest-blur className="text-[11px] font-bold text-red-500">{summary!.zero_stock}종</span>
            )}
          </div>
          {zeroItems.length === 0 ? (
            <div className="px-4 py-6 text-[12px] text-green-600 text-center font-medium">
              ✅ 재고 없는 품목 없음
            </div>
          ) : (
            <div className="divide-y divide-[rgba(0,0,0,0.05)]">
              {zeroItems.map(item => (
                <div key={item.id} className="px-3 py-2">
                  <div data-guest-blur className="text-[12px] font-medium text-[#1E293B] truncate">{item.item_name}</div>
                  <div className="text-[10px] text-[#94A3B8]">
                    {item.location}{item.category_large ? ` · ${item.category_large}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
