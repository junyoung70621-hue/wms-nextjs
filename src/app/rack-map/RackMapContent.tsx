'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
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
}

type RackGroup = {
  rack_no: string
  shelves: Record<string, Item[]>
}

function groupByRack(items: Item[]): { racks: RackGroup[]; noRack: Item[] } {
  const rackMap: Record<string, Record<string, Item[]>> = {}
  const noRack: Item[] = []

  for (const item of items) {
    if (!item.rack_no) { noRack.push(item); continue }
    if (!rackMap[item.rack_no]) rackMap[item.rack_no] = {}
    const shelf = item.shelf ?? '미지정'
    if (!rackMap[item.rack_no][shelf]) rackMap[item.rack_no][shelf] = []
    rackMap[item.rack_no][shelf].push(item)
  }

  const racks = Object.entries(rackMap)
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([rack_no, shelves]) => ({ rack_no, shelves }))

  return { racks, noRack }
}

function ItemChip({ item, onClick }: { item: Item; onClick: () => void }) {
  const low = item.quantity === 0
  return (
    <button
      onClick={onClick}
      className={`text-left w-full px-2 py-1 rounded text-[11px] transition-colors ${
        low
          ? 'bg-red-50 border border-red-200 hover:bg-red-100'
          : 'bg-white border border-[rgba(0,0,0,0.08)] hover:bg-gray-50'
      }`}
    >
      <div className="font-medium text-[#1E293B] truncate leading-tight">{item.item_name}</div>
      <div className={`text-[10px] mt-0.5 ${low ? 'text-red-500 font-bold' : 'text-[#94A3B8]'}`}>
        {item.quantity.toLocaleString()}개
        {item.box_no ? ` · ${item.box_no}` : ''}
      </div>
    </button>
  )
}

function ItemModal({ item, onClose }: { item: Item; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-5 w-80 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-[14px] font-bold text-[#1E293B]">{item.item_name}</h3>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E293B] text-lg leading-none">×</button>
        </div>
        <table className="w-full text-[12px]">
          <tbody className="divide-y divide-[rgba(0,0,0,0.05)]">
            {[
              ['수량', `${item.quantity.toLocaleString()}개`],
              ['랙', item.rack_no ?? '-'],
              ['선반', item.shelf ?? '-'],
              ['박스', item.box_no ?? '-'],
              ['대분류', item.category_large ?? '-'],
              ['중분류', item.category_mid ?? '-'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="py-1.5 pr-3 text-[#64748B] w-16">{k}</td>
                <td className="py-1.5 font-medium text-[#1E293B]">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function RackMapContent({ user }: { user: SessionUser }) {
  const [items,    setItems]    = useState<Item[]>([])
  const [centers,  setCenters]  = useState<string[]>([])
  const [center,   setCenter]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<Item | null>(null)

  const userCenter = user.assigned_center ?? user.center

  useEffect(() => {
    const isManager = user.role === 'admin' || user.role === 'materials'
    fetch('/api/rack-map' + (isManager ? '' : `?center=${encodeURIComponent(userCenter)}`))
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setCenters(d.centers ?? [])
        setCenter(isManager ? (d.centers?.[0] ?? '') : userCenter)
        setItems(d.data ?? [])
      })
      .catch(() => setError('로드 실패'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCenterChange = async (c: string) => {
    setCenter(c)
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/rack-map?center=${encodeURIComponent(c)}`)
      const d = await res.json()
      if (d.error) { setError(d.error); return }
      setItems(d.data ?? [])
    } catch { setError('로드 실패') }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(i =>
      i.item_name.toLowerCase().includes(q) ||
      (i.rack_no ?? '').toLowerCase().includes(q) ||
      (i.category_large ?? '').toLowerCase().includes(q)
    )
  }, [items, search])

  const { racks, noRack } = useMemo(() => groupByRack(filtered), [filtered])

  const isManager = user.role === 'admin' || user.role === 'materials'

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
              {centers.map(c => (
                <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          placeholder="품명 / 랙 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-[12px] w-48"
        />
        <span className="text-[11px] text-[#94A3B8] ml-auto">
          {filtered.length}개 품목 · {racks.length}개 랙
        </span>
      </div>

      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중...</div>
      ) : error ? (
        <div className="text-red-500 text-[12px]">{error}</div>
      ) : racks.length === 0 && noRack.length === 0 ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">
          {center} 센터에 등록된 자재 없음
        </div>
      ) : (
        <div className="space-y-3">
          {racks.map(rack => {
            const shelvesSorted = Object.entries(rack.shelves)
              .sort(([a], [b]) => a.localeCompare(b, 'ko'))
            return (
              <div
                key={rack.rack_no}
                className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden"
              >
                <div className="px-3 py-2 bg-[#F8F9FA] border-b border-[rgba(0,0,0,0.06)] flex items-center gap-2">
                  <span className="text-[12px] font-bold text-[#D3004F]">
                    📍 {rack.rack_no}
                  </span>
                  <span className="text-[10px] text-[#94A3B8]">
                    {Object.values(rack.shelves).flat().length}개 품목
                  </span>
                </div>
                <div className="p-2">
                  {shelvesSorted.map(([shelfName, shelfItems]) => (
                    <div key={shelfName} className="mb-2 last:mb-0">
                      <div className="text-[10px] text-[#64748B] font-medium mb-1 px-1">
                        선반 {shelfName}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                        {shelfItems.map(item => (
                          <ItemChip
                            key={item.id}
                            item={item}
                            onClick={() => setSelected(item)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* 위치 미지정 */}
          {noRack.length > 0 && (
            <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
              <div className="px-3 py-2 bg-[#F8F9FA] border-b border-[rgba(0,0,0,0.06)] flex items-center gap-2">
                <span className="text-[12px] font-bold text-[#94A3B8]">📦 위치 미지정</span>
                <span className="text-[10px] text-[#94A3B8]">{noRack.length}개 품목</span>
              </div>
              <div className="p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                {noRack.map(item => (
                  <ItemChip key={item.id} item={item} onClick={() => setSelected(item)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selected && <ItemModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
