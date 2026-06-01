'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { SessionUser } from '@/lib/session'
import { getViewableCenters } from '@/constants/centers'

// ── 타입 ──────────────────────────────────────────────────────────────────────
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
  location: string
  erp_name: string | null
  erp_code: string | null
  notes: string | null
}

type SortField = 'item_name' | 'quantity' | 'category_large' | 'category_mid' | 'category_small'

// ── KPI 카드 ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, color, active, onClick,
}: {
  label: string; value: number; color: string
  active?: boolean; onClick?: () => void
}) {
  return (
    <div
      className="rounded-lg p-3 text-center cursor-pointer transition-all"
      style={{
        background: active ? `${color}22` : `${color}11`,
        border: active ? `2px solid ${color}` : `1px solid ${color}55`,
      }}
      onClick={onClick}
    >
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-[22px] font-bold mt-0.5" style={{ color }}>
        {value.toLocaleString()}
      </div>
    </div>
  )
}

// ── 정렬 아이콘 ──────────────────────────────────────────────────────────────
function SortIcon({ field, sortField, sortDir }: {
  field: string; sortField: string; sortDir: 'asc' | 'desc'
}) {
  if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
  return <span className="ml-1" style={{ color: '#D3004F' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────
export default function WarehouseContent({ user }: { user: SessionUser }) {
  const userCenter = user.assigned_center ?? user.center
  const viewable   = getViewableCenters(user.role, userCenter)
  const isHub      = (c: string) => c === '자재센터'

  const [center, setCenter]     = useState(viewable[0] ?? '자재센터')
  const [data, setData]         = useState<Item[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  // 필터
  const [filterLarge,  setFilterLarge]  = useState('전체')
  const [filterMid,    setFilterMid]    = useState('전체')
  const [filterSmall,  setFilterSmall]  = useState('전체')
  const [search,       setSearch]       = useState('')
  const [kpiFilter,    setKpiFilter]    = useState<'all'|'low'|'zero'>('all')

  // 페이지
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 정렬
  const [sortField, setSortField] = useState<SortField>('item_name')
  const [sortDir,   setSortDir]   = useState<'asc'|'desc'>('asc')

  // ── 데이터 조회 ────────────────────────────────────────────────────────
  const fetchData = async (c: string) => {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/warehouse?center=${encodeURIComponent(c)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json.data)
    } catch (e: unknown) {
      setError((e as Error).message || '데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(center)
    setFilterLarge('전체'); setFilterMid('전체'); setFilterSmall('전체')
    setSearch(''); setKpiFilter('all'); setPage(1)
  }, [center])

  // ── 카테고리 목록 (데이터 기반) ────────────────────────────────────────
  const largeList = useMemo(() => {
    const s = new Set(data.map(r => r.category_large).filter(Boolean) as string[])
    return ['전체', ...Array.from(s).sort()]
  }, [data])

  const midList = useMemo(() => {
    const src = filterLarge === '전체' ? data : data.filter(r => r.category_large === filterLarge)
    const s = new Set(src.map(r => r.category_mid).filter(Boolean) as string[])
    return ['전체', ...Array.from(s).sort()]
  }, [data, filterLarge])

  const smallList = useMemo(() => {
    const src = data.filter(r =>
      (filterLarge === '전체' || r.category_large === filterLarge) &&
      (filterMid   === '전체' || r.category_mid   === filterMid)
    )
    const s = new Set(src.map(r => r.category_small).filter(Boolean) as string[])
    return ['전체', ...Array.from(s).sort()]
  }, [data, filterLarge, filterMid])

  // ── KPI 계산 ───────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const q = data.map(r => r.quantity ?? 0)
    return {
      all:  data.length,
      low:  q.filter(v => v >= 1 && v <= 9).length,
      zero: q.filter(v => v === 0).length,
    }
  }, [data])

  // ── 필터링 + 정렬 + 페이지네이션 ──────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = data
    if (filterLarge !== '전체') rows = rows.filter(r => r.category_large === filterLarge)
    if (filterMid   !== '전체') rows = rows.filter(r => r.category_mid   === filterMid)
    if (filterSmall !== '전체') rows = rows.filter(r => r.category_small === filterSmall)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.item_name.toLowerCase().includes(q) ||
        (r.erp_code        ?? '').toLowerCase().includes(q) ||
        (r.category_large  ?? '').toLowerCase().includes(q) ||
        (r.category_mid    ?? '').toLowerCase().includes(q)
      )
    }
    if (kpiFilter === 'low')  rows = rows.filter(r => (r.quantity ?? 0) >= 1 && (r.quantity ?? 0) <= 9)
    if (kpiFilter === 'zero') rows = rows.filter(r => (r.quantity ?? 0) === 0)
    return rows
  }, [data, filterLarge, filterMid, filterSmall, search, kpiFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortField] ?? ''
      const bv = b[sortField] ?? ''
      if (sortField === 'quantity') {
        return sortDir === 'asc'
          ? (a.quantity ?? 0) - (b.quantity ?? 0)
          : (b.quantity ?? 0) - (a.quantity ?? 0)
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [filtered, sortField, sortDir])

  const totalPages  = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paged       = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function handleCenterChange(c: string) { setCenter(c) }

  function Th({ label, field }: { label: string; field?: SortField }) {
    return (
      <th
        className={`px-3 py-2 text-left text-[11px] font-semibold text-[#64748B] border-b border-[rgba(0,0,0,0.08)] whitespace-nowrap uppercase tracking-wide ${field ? 'cursor-pointer select-none hover:text-[#D3004F]' : ''}`}
        onClick={field ? () => handleSort(field) : undefined}
      >
        {label}
        {field && <SortIcon field={field} sortField={sortField} sortDir={sortDir} />}
      </th>
    )
  }

  // ── 수량 색상 ──────────────────────────────────────────────────────────
  function qtyColor(q: number) {
    if (q === 0) return 'text-red-500 font-bold'
    if (q <= 9)  return 'text-amber-500 font-semibold'
    return 'text-[#1E293B]'
  }

  return (
    <div className="space-y-4">
      {/* 헤더 + 센터 선택 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-[#1E293B]">📦 재고 현황</h2>
        <div className="flex items-center gap-2">
          <Select value={center} onValueChange={handleCenterChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {viewable.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => fetchData(center)} disabled={loading}>
            {loading ? '로딩 중...' : '🔄 새로고침'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{error}</p>
      )}

      {/* KPI 카드 */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard
            label="📦 전체 품목" value={kpi.all} color="#4A9EFF"
            active={kpiFilter === 'all'}
            onClick={() => { setKpiFilter('all'); setPage(1) }}
          />
          <KpiCard
            label="⚠️ 재고 부족 (1~9)" value={kpi.low} color="#FFAA00"
            active={kpiFilter === 'low'}
            onClick={() => { setKpiFilter(kpiFilter === 'low' ? 'all' : 'low'); setPage(1) }}
          />
          <KpiCard
            label="🚨 재고 없음" value={kpi.zero} color="#FF4444"
            active={kpiFilter === 'zero'}
            onClick={() => { setKpiFilter(kpiFilter === 'zero' ? 'all' : 'zero'); setPage(1) }}
          />
        </div>
      )}

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          className="w-[220px]"
          placeholder="자재명 / ERP코드 / 분류명 검색..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
        <Select value={filterLarge} onValueChange={v => { setFilterLarge(v); setFilterMid('전체'); setFilterSmall('전체'); setPage(1) }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="대분류" /></SelectTrigger>
          <SelectContent>{largeList.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterMid} onValueChange={v => { setFilterMid(v); setFilterSmall('전체'); setPage(1) }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="중분류" /></SelectTrigger>
          <SelectContent>{midList.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterSmall} onValueChange={v => { setFilterSmall(v); setPage(1) }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="소분류" /></SelectTrigger>
          <SelectContent>{smallList.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        {(filterLarge !== '전체' || filterMid !== '전체' || filterSmall !== '전체' || search || kpiFilter !== 'all') && (
          <Button variant="ghost" className="text-[#D3004F]" onClick={() => {
            setFilterLarge('전체'); setFilterMid('전체'); setFilterSmall('전체')
            setSearch(''); setKpiFilter('all'); setPage(1)
          }}>
            ✕ 초기화
          </Button>
        )}
      </div>

      {/* 테이블 정보 + 페이지 크기 */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span><b className="text-[#1E293B]">{center}</b> — 총 {sorted.length.toLocaleString()}개 품목</span>
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1) }}>
          <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[20, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}개씩</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 border rounded">
          데이터 로딩 중...
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400 border rounded">
          📭 해당 조건의 재고가 없습니다.
        </div>
      ) : (
        <div className="border rounded overflow-auto max-h-[560px]">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 bg-[#F8F9FA] z-10">
              <tr>
                <Th label="자재명"  field="item_name" />
                <Th label="수량"    field="quantity" />
                <Th label="대분류"  field="category_large" />
                <Th label="중분류"  field="category_mid" />
                <Th label="소분류"  field="category_small" />
                {isHub(center) && <Th label="렉번호" />}
                {isHub(center) && <Th label="단/박스" />}
                <Th label="ERP코드" />
              </tr>
            </thead>
            <tbody>
              {paged.map((item, i) => (
                <tr key={item.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                  <td className="px-3 py-1.5 text-[#1E293B] max-w-[220px] truncate font-medium">
                    {item.item_name}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono font-bold ${qtyColor(item.quantity ?? 0)}`}>
                    {(item.quantity ?? 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-[#475569] whitespace-nowrap">
                    {item.category_large ?? ''}
                  </td>
                  <td className="px-3 py-1.5 text-[#475569] whitespace-nowrap">
                    {item.category_mid ?? ''}
                  </td>
                  <td className="px-3 py-1.5 text-[#475569] whitespace-nowrap">
                    {item.category_small ?? ''}
                  </td>
                  {isHub(center) && (
                    <td className="px-3 py-1.5 text-[#64748B] whitespace-nowrap font-mono">
                      {item.rack_no ?? ''}
                    </td>
                  )}
                  {isHub(center) && (
                    <td className="px-3 py-1.5 text-[#64748B] whitespace-nowrap font-mono text-[11px]">
                      {[item.shelf, item.box_no].filter(Boolean).join(' / ')}
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-[#94A3B8] font-mono text-[11px]">
                    {item.erp_code ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1}
            onClick={() => setPage(p => p - 1)}>◀</Button>
          <span className="text-sm text-gray-600">
            {currentPage} / {totalPages} 페이지
          </span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages}
            onClick={() => setPage(p => p + 1)}>▶</Button>
        </div>
      )}
    </div>
  )
}
