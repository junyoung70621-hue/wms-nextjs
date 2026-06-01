'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { SessionUser } from '@/lib/session'

type Summary = {
  total_items: number
  total_qty: number
  mat_pending: number
  pur_pending: number
}

type CenterRow = {
  center: string
  items: number
  total_qty: number
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

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  in:       { label: '입고', color: '#2e7d32' },
  out:      { label: '출고', color: '#c62828' },
  transfer: { label: '이동', color: '#1565c0' },
  adjust:   { label: '조정', color: '#f57c00' },
}

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 3600 * 1000)
      .toISOString().slice(0, 16).replace('T', ' ')
  } catch { return ts.slice(0, 16).replace('T', ' ') }
}

function StatCard({
  label, value, sub, href, color,
}: {
  label: string
  value: string | number
  sub?: string
  href?: string
  color?: string
}) {
  const inner = (
    <div
      className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-4 flex flex-col gap-1 hover:shadow-sm transition-shadow"
      style={color ? { borderLeftWidth: 3, borderLeftColor: color } : {}}
    >
      <span className="text-[11px] text-[#64748B] font-medium tracking-wide uppercase">{label}</span>
      <span className="text-[28px] font-bold text-[#1E293B] leading-none">{value.toLocaleString()}</span>
      {sub && <span className="text-[11px] text-[#94A3B8]">{sub}</span>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

export default function DashboardContent({ user }: { user: SessionUser }) {
  const [summary,  setSummary]  = useState<Summary | null>(null)
  const [centers,  setCenters]  = useState<CenterRow[]>([])
  const [history,  setHistory]  = useState<HistoryRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setSummary(d.summary)
        setCenters(d.centers)
        setHistory(d.history)
      })
      .catch(() => setError('데이터 로드 실패'))
      .finally(() => setLoading(false))
  }, [])

  const isManager = user.role === 'admin' || user.role === 'materials'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-[#94A3B8] text-sm">
        불러오는 중...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-500 text-sm p-4">{error}</div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="자재 종류"
          value={summary?.total_items ?? 0}
          sub="등록된 품목 수"
          href="/warehouse"
          color="#D3004F"
        />
        <StatCard
          label="총 재고량"
          value={summary?.total_qty ?? 0}
          sub="전체 수량 합계"
          href="/warehouse"
          color="#1565c0"
        />
        <StatCard
          label="대기 자재요청"
          value={summary?.mat_pending ?? 0}
          sub="처리 대기 중"
          href="/material-requests"
          color={(summary?.mat_pending ?? 0) > 0 ? '#f57c00' : '#94A3B8'}
        />
        <StatCard
          label="대기 구매요청"
          value={summary?.pur_pending ?? 0}
          sub="처리 대기 중"
          href="/purchase-requests"
          color={(summary?.pur_pending ?? 0) > 0 ? '#f57c00' : '#94A3B8'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 센터별 재고 현황 */}
        <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1E293B]">
              {isManager ? '센터별 재고 현황' : '내 센터 재고 현황'}
            </span>
            <Link href="/warehouse" className="text-[11px] text-[#D3004F] hover:underline">
              상세 보기 →
            </Link>
          </div>
          {centers.length === 0 ? (
            <div className="px-4 py-6 text-[12px] text-[#94A3B8] text-center">데이터 없음</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#F8F9FA] text-[#64748B]">
                  <th className="px-4 py-2 text-left font-medium">센터</th>
                  <th className="px-4 py-2 text-right font-medium">품목 수</th>
                  <th className="px-4 py-2 text-right font-medium">총 수량</th>
                </tr>
              </thead>
              <tbody>
                {centers.map((c, i) => (
                  <tr key={c.center} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                    <td className="px-4 py-2 font-medium text-[#1E293B]">{c.center}</td>
                    <td className="px-4 py-2 text-right text-[#475569]">{c.items.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-[#475569]">{c.total_qty.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 최근 입출고 이력 */}
        <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1E293B]">최근 입출고</span>
            <Link href="/history" className="text-[11px] text-[#D3004F] hover:underline">
              전체 보기 →
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
                  <div key={h.id} className="px-4 py-2.5 flex items-center gap-3">
                    <span
                      className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: act.color, background: act.color + '18' }}
                    >
                      {act.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-[#1E293B] truncate">{itemName}</div>
                      <div className="text-[11px] text-[#94A3B8]">
                        {location} · {actor} · {h.quantity.toLocaleString()}개
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
      </div>
    </div>
  )
}
