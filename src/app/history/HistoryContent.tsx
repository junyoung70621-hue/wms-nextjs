'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { SessionUser } from '@/lib/session'
import { CENTERS } from '@/constants/centers'

// ── 타입 ──────────────────────────────────────────────────────────────────────
type HistoryRow = {
  id: string
  action_type: string
  quantity: number
  reason: string | null
  from_center: string | null
  to_center: string | null
  snapshot_qty_before: number | null
  snapshot_qty_after: number | null
  acted_at: string
  warehouse: { item_name: string; location: string } | null
  users: { name: string } | null
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
const ACTION_LABEL: Record<string, string> = {
  in: '📥 입고',
  out: '📤 출고',
  transfer: '🚚 이동',
  edit: '✏️ 수정',
}

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    return kst.toISOString().slice(0, 16).replace('T', ' ')
  } catch {
    return ts.slice(0, 16).replace('T', ' ')
  }
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
export default function HistoryContent({ user }: { user: SessionUser }) {
  const [data, setData]       = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [filterAction, setFilterAction] = useState('all')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterLimit,  setFilterLimit]  = useState('200')
  const [filterCenter, setFilterCenter] = useState('전체')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')

  const isAdminOrMaterials = user.role === 'admin' || user.role === 'materials'
  const userCenter = user.assigned_center ?? user.center

  // ── 데이터 조회 ──────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: filterLimit })
      if (filterAction !== 'all') params.set('action', filterAction)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo)   params.set('date_to',   dateTo)
      const res  = await fetch(`/api/history?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json.data)
    } catch (e: unknown) {
      setError((e as Error).message || '데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [filterAction, filterLimit, dateFrom, dateTo])

  // ── 클라이언트 필터 ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = data

    // 센터
    const targetCenter = isAdminOrMaterials ? filterCenter : userCenter
    if (targetCenter !== '전체') {
      rows = rows.filter(h => {
        const loc = h.warehouse?.location
        return (
          h.from_center === targetCenter ||
          h.to_center   === targetCenter ||
          loc           === targetCenter
        )
      })
    }

    // 검색
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase()
      rows = rows.filter(h =>
        (h.warehouse?.item_name ?? '').toLowerCase().includes(q) ||
        (h.users?.name          ?? '').toLowerCase().includes(q) ||
        (h.reason               ?? '').toLowerCase().includes(q)
      )
    }

    return rows
  }, [data, filterCenter, filterSearch, isAdminOrMaterials, userCenter])

  // ── CSV 다운로드 ──────────────────────────────────────────────────────────
  const handleCsvDownload = () => {
    const headers = ['일시','작업자','자재명','센터','작업유형','수량','변경전','변경후','이동경로','사유']
    const rows = filtered.map(h => {
      const route = h.from_center && h.to_center
        ? `${h.from_center} → ${h.to_center}` : ''
      return [
        tsKst(h.acted_at),
        h.users?.name ?? '',
        h.warehouse?.item_name ?? '',
        h.warehouse?.location  ?? '',
        ACTION_LABEL[h.action_type] ?? h.action_type,
        h.quantity,
        h.snapshot_qty_before ?? '',
        h.snapshot_qty_after  ?? '',
        route,
        h.reason ?? '',
      ]
    })
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = 'WMS_입출고이력.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[#1E293B]">📋 입출고 이력</h2>

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* 작업 유형 */}
        <Select value={filterAction} onValueChange={v => { if (v !== null) setFilterAction(v) }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="in">📥 입고</SelectItem>
            <SelectItem value="out">📤 출고</SelectItem>
            <SelectItem value="transfer">🚚 이동</SelectItem>
            <SelectItem value="edit">✏️ 수정</SelectItem>
          </SelectContent>
        </Select>

        {/* 검색 */}
        <Input
          className="w-[240px]"
          placeholder="자재명 / 작업자 / 사유 검색..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
        />

        {/* 센터 (admin/materials만) */}
        {isAdminOrMaterials && (
          <Select value={filterCenter} onValueChange={v => v !== null && setFilterCenter(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="전체">전체 센터</SelectItem>
              {CENTERS.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* 표시 건수 */}
        <Select value={filterLimit} onValueChange={v => { if (v !== null) setFilterLimit(v) }}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100건</SelectItem>
            <SelectItem value="200">200건</SelectItem>
            <SelectItem value="500">500건</SelectItem>
            <SelectItem value="1000">1000건</SelectItem>
          </SelectContent>
        </Select>

        {/* 날짜 범위 */}
        <div className="flex items-center gap-1 text-[12px]">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-[#D3004F] h-8"
          />
          <span className="text-[#94A3B8]">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-[#D3004F] h-8"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-[#94A3B8] hover:text-[#D3004F] text-[11px] px-1"
            >
              ✕
            </button>
          )}
        </div>

        <Button variant="outline" onClick={fetchData} disabled={loading} className="h-8 text-[12px]">
          {loading ? '...' : '🔄'}
        </Button>

        <Button
          variant="outline"
          onClick={handleCsvDownload}
          disabled={loading || filtered.length === 0}
          className="h-8 text-[12px]"
        >
          ⬇️ CSV
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">
          {error}
        </p>
      )}

      <p className="text-sm text-gray-500">총 {filtered.length.toLocaleString()}건</p>

      {/* 테이블 */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 border rounded">
          데이터 로딩 중...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400 border rounded">
          이력이 없습니다.
        </div>
      ) : (
        <div className="border rounded overflow-auto max-h-[600px]">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 bg-[#F8F9FA] z-10">
              <tr>
                {['일시','작업자','자재명','센터','작업유형','수량','변경전','변경후','이동경로','사유'].map(h => (
                  <th
                    key={h}
                    className="text-left px-3 py-2 font-semibold text-[#64748B] border-b border-[rgba(0,0,0,0.08)] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h, i) => {
                const route = h.from_center && h.to_center
                  ? `${h.from_center} → ${h.to_center}` : ''
                return (
                  <tr
                    key={h.id}
                    className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap font-mono text-[11px] text-[#475569]">
                      {tsKst(h.acted_at)}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[#1E293B]">
                      {h.users?.name ?? ''}
                    </td>
                    <td className="px-3 py-1.5 text-[#1E293B] max-w-[200px] truncate">
                      {h.warehouse?.item_name ?? ''}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[#64748B]">
                      {h.warehouse?.location ?? ''}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {ACTION_LABEL[h.action_type] ?? h.action_type}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[#1E293B]">
                      {h.quantity.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[#94A3B8]">
                      {h.snapshot_qty_before ?? ''}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[#94A3B8]">
                      {h.snapshot_qty_after ?? ''}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[#64748B] text-[11px]">
                      {route}
                    </td>
                    <td className="px-3 py-1.5 text-[#475569] max-w-[200px] truncate">
                      {h.reason ?? ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
