'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { SessionUser } from '@/lib/session'
import { CENTERS } from '@/constants/centers'

type Row = {
  id: string
  quantity: number
  reason: string | null
  from_center: string | null
  snapshot_qty_before: number | null
  snapshot_qty_after: number | null
  acted_at: string
  warehouse: { item_name: string; location: string } | null
  users: { name: string } | null
}

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    const kst = new Date(new Date(ts).getTime() + 9 * 60 * 60 * 1000)
    return kst.toISOString().slice(0, 16).replace('T', ' ')
  } catch { return ts.slice(0, 16).replace('T', ' ') }
}

function today()    { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function UsageContent({ user }: { user: SessionUser }) {
  const userCenter         = user.assigned_center ?? user.center
  const isAdminOrMaterials = user.role === 'admin' || user.role === 'materials'

  const [data,    setData]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [center,    setCenter]   = useState(isAdminOrMaterials ? '전체' : userCenter)
  const [dateFrom,  setDateFrom] = useState(daysAgo(30))
  const [dateTo,    setDateTo]   = useState(today())
  const [search,    setSearch]   = useState('')
  const [limit,     setLimit]    = useState('200')

  const fetchData = async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ limit })
      const targetCenter = isAdminOrMaterials ? center : userCenter
      if (targetCenter && targetCenter !== '전체') params.set('center', targetCenter)
      const res  = await fetch(`/api/usage?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json.data)
    } catch (e: unknown) {
      setError((e as Error).message || '오류가 발생했습니다.')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [center, limit])

  const filtered = useMemo(() => {
    let rows = data

    // 기간 필터
    rows = rows.filter(h => {
      const d = tsKst(h.acted_at).slice(0, 10)
      return d >= dateFrom && d <= dateTo
    })

    // 검색
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(h =>
        (h.warehouse?.item_name ?? '').toLowerCase().includes(q) ||
        (h.users?.name          ?? '').toLowerCase().includes(q) ||
        (h.reason               ?? '').toLowerCase().includes(q)
      )
    }

    return rows
  }, [data, dateFrom, dateTo, search])

  const handleCsvDownload = () => {
    const headers = ['일시','센터','담당자','자재명','사용수량','변경전','변경후','사유']
    const rows = filtered.map(h => ([
      tsKst(h.acted_at),
      h.from_center ?? h.warehouse?.location ?? '',
      h.users?.name ?? '',
      h.warehouse?.item_name ?? '',
      h.quantity,
      h.snapshot_qty_before ?? '',
      h.snapshot_qty_after  ?? '',
      h.reason ?? '',
    ]))
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${center}_사용내역.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[#1E293B]">📊 센터 사용내역</h2>

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* 센터 */}
        {isAdminOrMaterials ? (
          <Select value={center} onValueChange={v => v !== null && setCenter(v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="전체">전체 센터</SelectItem>
              {CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <div className="px-3 py-1.5 border rounded text-sm text-[#1E293B] bg-gray-50 min-w-[120px]">
            {userCenter}
          </div>
        )}

        {/* 날짜 범위 */}
        <input
          type="date" value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#D3004F]"
        />
        <span className="text-gray-400 text-sm">~</span>
        <input
          type="date" value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#D3004F]"
        />

        {/* 검색 */}
        <Input
          className="w-[200px]"
          placeholder="자재명 / 담당자 / 사유..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* 건수 */}
        <Select value={limit} onValueChange={v => v !== null && setLimit(v)}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['100','200','500','1000'].map(n =>
              <SelectItem key={n} value={n}>{n}건</SelectItem>
            )}
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={fetchData} disabled={loading}>
          {loading ? '로딩 중...' : '🔄 새로고침'}
        </Button>
        <Button variant="outline" onClick={handleCsvDownload}
          disabled={loading || filtered.length === 0}>
          ⬇️ CSV
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{error}</p>
      )}

      <p className="text-sm text-gray-500">총 {filtered.length.toLocaleString()}건</p>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 border rounded">
          데이터 로딩 중...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400 border rounded">
          사용내역이 없습니다.
        </div>
      ) : (
        <div className="border rounded overflow-auto max-h-[600px]">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 bg-[#F8F9FA] z-10">
              <tr>
                {['일시','센터','담당자','자재명','사용수량','변경전','변경후','사유'].map(h => (
                  <th key={h}
                    className="text-left px-3 py-2 font-semibold text-[#64748B] border-b border-[rgba(0,0,0,0.08)] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h, i) => (
                <tr key={h.id}
                  className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                  <td className="px-3 py-1.5 whitespace-nowrap font-mono text-[11px] text-[#475569]">
                    {tsKst(h.acted_at)}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-[#64748B]">
                    {h.from_center ?? h.warehouse?.location ?? ''}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-[#1E293B]">
                    {h.users?.name ?? ''}
                  </td>
                  <td className="px-3 py-1.5 text-[#1E293B] max-w-[200px] truncate font-medium">
                    {h.warehouse?.item_name ?? ''}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-[#D3004F]">
                    {h.quantity.toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[#94A3B8]">
                    {h.snapshot_qty_before ?? ''}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[#94A3B8]">
                    {h.snapshot_qty_after ?? ''}
                  </td>
                  <td className="px-3 py-1.5 text-[#475569] max-w-[220px] truncate">
                    {h.reason ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
