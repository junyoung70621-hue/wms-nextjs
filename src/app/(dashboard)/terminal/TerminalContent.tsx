'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { SessionUser } from '@/lib/session'

type Item = {
  id: number
  item_name: string
  quantity: number
  rack_no: string | null
  shelf: string | null
  box_no: string | null
  category_large: string | null
  category_mid: string | null
  category_small: string | null
  erp_name: string | null
  erp_code: string | null
  notes: string | null
}

const TYPE_CENTER: Record<'bus' | 'taxi', string> = {
  bus:  '티머니(버스)',
  taxi: '티머니(택시)',
}

type Props = { type: 'bus' | 'taxi'; user: SessionUser }

export default function TerminalContent({ type }: Props) {
  const center = TYPE_CENTER[type]

  const [items,   setItems]   = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [search,  setSearch]  = useState('')
  const [catL,    setCatL]    = useState('전체')

  useEffect(() => {
    fetch(`/api/warehouse?center=${encodeURIComponent(center)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setItems(d.data ?? [])
      })
      .catch(() => setError('로드 실패'))
      .finally(() => setLoading(false))
  }, [center])

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
          !(item.erp_code ?? '').toLowerCase().includes(q) &&
          !(item.erp_name ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [items, catL, search])

  const totalQty = filtered.reduce((s, i) => s + (i.quantity ?? 0), 0)
  const zeroStock = filtered.filter(i => i.quantity === 0).length

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '품목 수',    value: filtered.length, color: '#B32646' },
          { label: '총 수량',   value: totalQty,         color: '#1565c0' },
          { label: '재고 없음', value: zeroStock,         color: zeroStock > 0 ? '#c62828' : '#94A3B8' },
        ].map(c => (
          <div
            key={c.label}
            className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-3 text-center"
            style={{ borderLeftWidth: 3, borderLeftColor: c.color }}
          >
            <div className="text-[10px] text-[#64748B] uppercase tracking-wide">{c.label}</div>
            <div className="text-[24px] font-bold mt-0.5" style={{ color: c.color }}>
              {c.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3">
      <div className="flex flex-wrap gap-2 items-center">
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
        <span className="text-[11px] text-[#94A3B8] ml-auto">{center} · {filtered.length}개 품목</span>
      </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중...</div>
      ) : error ? (
        <div className="text-red-500 text-[12px]">{error}</div>
      ) : (
        <div className="bg-white rounded-lg border border-[#e2e8f0] overflow-hidden">
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
                  <td colSpan={7} className="px-3 py-6 text-center text-[#94A3B8]">
                    데이터 없음
                  </td>
                </tr>
              ) : (
                filtered.map((item, i) => (
                  <tr
                    key={item.id}
                    className={`${
                      item.quantity === 0
                        ? 'bg-red-50'
                        : i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'
                    }`}
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
