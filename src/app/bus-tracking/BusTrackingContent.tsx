'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { SessionUser } from '@/lib/session'
import { getViewableCenters } from '@/constants/centers'

type Item = {
  id: number
  item_name: string
  quantity: number
  rack_no: string | null
  category_large: string | null
  category_mid: string | null
  erp_code: string | null
  notes: string | null
  location: string
}

// 버스 관련 센터
const BUS_CENTERS = ['자재센터', '강서센터', '강북센터', '강동센터', '강남센터']

export default function BusTrackingContent({ user }: { user: SessionUser }) {
  const userCenter = user.assigned_center ?? user.center
  const viewable = getViewableCenters(user.role, userCenter)
  const busCenters = BUS_CENTERS.filter(c => viewable.includes(c))
  const isManager = user.role === 'admin' || user.role === 'materials'

  const [center,  setCenter]  = useState(isManager ? busCenters[0] ?? '' : userCenter)
  const [items,   setItems]   = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [search,  setSearch]  = useState('')
  const [catL,    setCatL]    = useState('전체')

  const loadItems = async (c: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/warehouse?center=${encodeURIComponent(c)}`)
      const d = await res.json()
      if (d.error) { setError(d.error); return }
      setItems(d.data ?? [])
    } catch { setError('로드 실패') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (center) loadItems(center)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCenterChange = (c: string) => {
    setCenter(c)
    loadItems(c)
  }

  const catLOptions = useMemo(() => {
    const s = new Set(items.map(i => i.category_large ?? '미분류'))
    return ['전체', ...Array.from(s).sort()]
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (catL !== '전체' && (item.category_large ?? '미분류') !== catL) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !item.item_name.toLowerCase().includes(q) &&
          !(item.erp_code ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [items, catL, search])

  // 카테고리별 집계
  const catSummary = useMemo(() => {
    const map: Record<string, { items: number; qty: number }> = {}
    for (const item of filtered) {
      const cat = item.category_large ?? '미분류'
      if (!map[cat]) map[cat] = { items: 0, qty: 0 }
      map[cat].items += 1
      map[cat].qty   += item.quantity ?? 0
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b, 'ko'))
      .map(([cat, v]) => ({ cat, ...v }))
  }, [filtered])

  const totalQty   = filtered.reduce((s, i) => s + (i.quantity ?? 0), 0)
  const zeroStock  = filtered.filter(i => i.quantity === 0).length

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2 items-center">
        {isManager && (
          <Select value={center} onValueChange={v => v !== null && handleCenterChange(v)}>
            <SelectTrigger className="h-8 text-[12px] w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {busCenters.map(c => (
                <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          placeholder="품명 / ERP코드 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-[12px] w-52"
        />
        <Select value={catL} onValueChange={v => v !== null && setCatL(v)}>
          <SelectTrigger className="h-8 text-[12px] w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {catLOptions.map(c => (
              <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-[#94A3B8] ml-auto">
          {center} · {filtered.length}개 품목
        </span>
      </div>

      {/* 카테고리 요약 */}
      {catSummary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {catSummary.map(c => (
            <button
              key={c.cat}
              onClick={() => setCatL(prev => prev === c.cat ? '전체' : c.cat)}
              className={`text-left p-2.5 rounded-lg border transition-all text-[12px] ${
                catL === c.cat
                  ? 'border-[#D3004F] bg-[rgba(211,0,79,0.05)]'
                  : 'border-[rgba(0,0,0,0.08)] bg-white hover:bg-gray-50'
              }`}
            >
              <div className="font-medium text-[#1E293B] truncate">{c.cat}</div>
              <div className="text-[10px] text-[#94A3B8] mt-0.5">
                {c.items}종 · {c.qty.toLocaleString()}개
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 요약 수치 */}
      <div className="flex gap-4 text-[12px]">
        <span className="text-[#64748B]">
          총 <strong className="text-[#1E293B]">{filtered.length}</strong>종
        </span>
        <span className="text-[#64748B]">
          총 <strong className="text-[#1E293B]">{totalQty.toLocaleString()}</strong>개
        </span>
        {zeroStock > 0 && (
          <span className="text-red-500 font-medium">재고없음 {zeroStock}종</span>
        )}
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중...</div>
      ) : error ? (
        <div className="text-red-500 text-[12px]">{error}</div>
      ) : (
        <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#F8F9FA] text-[#64748B]">
                <th className="px-3 py-2.5 text-left font-medium">품명</th>
                <th className="px-3 py-2.5 text-left font-medium">ERP코드</th>
                <th className="px-3 py-2.5 text-left font-medium">대분류</th>
                <th className="px-3 py-2.5 text-left font-medium">중분류</th>
                <th className="px-3 py-2.5 text-right font-medium">수량</th>
                <th className="px-3 py-2.5 text-left font-medium">랙</th>
                <th className="px-3 py-2.5 text-left font-medium">비고</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[#94A3B8]">데이터 없음</td>
                </tr>
              ) : (
                filtered.map((item, i) => (
                  <tr
                    key={item.id}
                    className={
                      item.quantity === 0
                        ? 'bg-red-50'
                        : i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'
                    }
                  >
                    <td className="px-3 py-2 font-medium text-[#1E293B]">{item.item_name}</td>
                    <td className="px-3 py-2 text-[#64748B] font-mono">{item.erp_code ?? '-'}</td>
                    <td className="px-3 py-2 text-[#64748B]">{item.category_large ?? '-'}</td>
                    <td className="px-3 py-2 text-[#64748B]">{item.category_mid ?? '-'}</td>
                    <td className={`px-3 py-2 text-right font-bold ${
                      item.quantity === 0 ? 'text-red-500' : 'text-[#1E293B]'
                    }`}>
                      {item.quantity.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-[#94A3B8]">{item.rack_no ?? '-'}</td>
                    <td className="px-3 py-2 text-[#94A3B8] max-w-[120px] truncate">
                      {item.notes ?? '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
