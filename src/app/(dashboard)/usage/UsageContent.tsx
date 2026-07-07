'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { SessionUser } from '@/lib/session'
import GuestCallout from '@/components/auth/GuestCallout'
import { CENTERS } from '@/constants/centers'
import { downloadUsageTemplate, type StockLite } from '@/lib/usageTemplate'

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

// ── XLSX 파싱 ─────────────────────────────────────────────────────────────────
type ParsedRow = { item_name: string; erp_code: string; quantity: number; reason: string }
type UploadResult = ParsedRow & { ok: boolean; error?: string; before?: number; after?: number }

// 헤더 매핑: 자재명→item_name, ERP코드→erp_code, 사용수량→quantity, 사용사유→reason
// 자재명·ERP코드 중 하나라도 있고 사용수량>0 인 행만 채택
function parseXlsx(buf: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  if (aoa.length < 2) return []

  const header = (aoa[0] as unknown[]).map(h => String(h ?? '').trim())
  const colIdx = (names: string[]) => {
    for (const n of names) {
      const i = header.findIndex(h => h === n)
      if (i !== -1) return i
    }
    return -1
  }
  const iName   = colIdx(['자재명', 'item_name', '품명'])
  const iErp    = colIdx(['ERP코드', 'erp_code', 'ERP'])
  const iQty    = colIdx(['사용수량', '수량', 'quantity'])
  const iReason = colIdx(['사용사유', '사유', 'reason', '비고'])

  if (iName === -1 && iErp === -1) return []

  return (aoa.slice(1) as unknown[][]).map(cells => ({
    item_name: iName   >= 0 ? String(cells[iName]   ?? '').trim() : '',
    erp_code:  iErp    >= 0 ? String(cells[iErp]    ?? '').trim() : '',
    quantity:  iQty    >= 0 ? (parseInt(String(cells[iQty] ?? '0')) || 0) : 0,
    reason:    iReason >= 0 ? String(cells[iReason] ?? '').trim() : '',
  })).filter(r => (r.item_name || r.erp_code) && r.quantity > 0)
}

// ── 업로드 탭 ─────────────────────────────────────────────────────────────────
function UploadTab({ user, onDone }: { user: SessionUser; onDone: () => void }) {
  const isAdmin    = user.role === 'admin'
  const userCenter = user.assigned_center ?? user.center

  const [center,    setCenter]   = useState(userCenter)
  const [rows,      setRows]     = useState<ParsedRow[]>([])
  const [results,   setResults]  = useState<UploadResult[] | null>(null)
  const [saving,    setSaving]   = useState(false)
  const [tmplLoading, setTmplLoading] = useState(false)
  const [msg,       setMsg]      = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // 현재 센터 재고를 조회해 자재명·ERP코드 프리필된 스타일 XLSX 양식 다운로드
  const downloadTemplate = async () => {
    const target = isAdmin ? center : userCenter
    setTmplLoading(true); setMsg('')
    try {
      const res = await fetch(`/api/warehouse?center=${encodeURIComponent(target)}`)
      const j = await res.json()
      if (!res.ok) { setMsg(`❌ ${j.error ?? '재고 조회 실패'}`); return }
      const stock: StockLite[] = (j.data ?? []).map((d: { item_name: string; erp_code: string | null }) => ({
        item_name: d.item_name, erp_code: d.erp_code,
      }))
      await downloadUsageTemplate(target, stock)
    } catch { setMsg('❌ 양식 생성 실패') }
    finally { setTmplLoading(false) }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setResults(null); setMsg('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = parseXlsx(ev.target?.result as ArrayBuffer)
        if (!parsed.length) { setMsg('❌ 올바른 양식이 아니거나, 사용수량(>0)이 입력된 행이 없습니다.'); return }
        setRows(parsed)
      } catch { setMsg('❌ 엑셀 파일을 읽지 못했습니다.') }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleSubmit = async () => {
    if (!rows.length) return
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, center: isAdmin ? center : undefined }),
      })
      const j = await res.json()
      if (!res.ok) { setMsg(`❌ ${j.error}`); return }
      setResults(j.results)
      const ok  = j.results.filter((r: UploadResult) => r.ok).length
      const fail = j.results.filter((r: UploadResult) => !r.ok).length
      setMsg(`✅ ${ok}건 처리 완료${fail ? ` · ❌ ${fail}건 실패` : ''}`)
      setRows([])
      if (fileRef.current) fileRef.current.value = ''
      onDone()
    } finally { setSaving(false) }
  }

  const reset = () => { setRows([]); setResults(null); setMsg(''); if (fileRef.current) fileRef.current.value = '' }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* 안내 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[12px] text-[#1E293B] space-y-1">
        <p className="font-semibold text-[#1565c0]">📋 사용내역 업로드 안내</p>
        <p>「양식 다운로드」를 누르면 해당 센터 현재고가 채워진 엑셀이 받아집니다. <b>노란색 사용수량 칸만 입력</b>해 다시 올리면 재고가 차감됩니다.</p>
        <p className="text-[#64748B]">입력 컬럼: <code className="bg-white px-1 rounded">사용수량</code>(필수) · <code className="bg-white px-1 rounded">사용사유</code>(선택) &nbsp;|&nbsp; 프리필: <code className="bg-white px-1 rounded">자재명</code> · <code className="bg-white px-1 rounded">ERP코드</code></p>
      </div>

      {/* 센터 선택 (admin only) + 파일 */}
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3">
      <div className="flex flex-wrap gap-2 items-center">
        {isAdmin && (
          <Select value={center} onValueChange={v => v !== null && setCenter(v)}>
            <SelectTrigger className="w-[150px] h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>{CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {!isAdmin && (
          <div className="px-3 py-1.5 border rounded text-[12px] text-[#1E293B] bg-gray-50">{userCenter}</div>
        )}
        <Button variant="outline" className="text-[12px] h-8" onClick={downloadTemplate} disabled={tmplLoading}>
          {tmplLoading ? '양식 생성 중...' : '📥 양식 다운로드'}
        </Button>
        <label className="cursor-pointer">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          <span className="inline-flex items-center px-3 h-8 border rounded text-[12px] bg-white hover:bg-gray-50 transition-colors cursor-pointer">
            📂 엑셀 파일 선택
          </span>
        </label>
        <GuestCallout label="양식 다운로드 → 사용수량 입력 → 업로드하면 재고 자동 차감" />
        {rows.length > 0 && (
          <Button variant="ghost" className="text-[12px] h-8 text-[#94A3B8]" onClick={reset}>✕ 초기화</Button>
        )}
      </div>
      </div>

      {msg && <p className="text-[12px]">{msg}</p>}

      {/* 미리보기 */}
      {rows.length > 0 && (
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#1E293B]">
              미리보기 — {rows.length}행 · 센터: <b>{isAdmin ? center : userCenter}</b>
            </span>
            <Button onClick={handleSubmit} disabled={saving}
              className="bg-[#B32646] hover:bg-[#B0003D] text-white text-[12px] h-8">
              {saving ? '처리 중...' : `📤 ${rows.length}건 차감 확정`}
            </Button>
          </div>
          <div className="border rounded overflow-auto max-h-[400px]">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0 bg-[#F8F9FA]">
                <tr>
                  {['#','자재명','ERP코드','사용수량','사용사유'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-[#64748B] border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-1.5 text-[#94A3B8]">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium text-[#1E293B]">{r.item_name}</td>
                    <td className="px-3 py-1.5 font-mono text-[#64748B] text-[11px]">{r.erp_code}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-[#B32646]">{r.quantity}</td>
                    <td className="px-3 py-1.5 text-[#475569]">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 처리 결과 */}
      {results && results.length > 0 && (
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-2">
          <p className="text-[12px] font-semibold text-[#1E293B]">처리 결과</p>
          <div className="border rounded overflow-auto max-h-[300px]">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0 bg-[#F8F9FA]">
                <tr>
                  {['결과','자재명','수량','변경 전→후','사유/오류'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-[#64748B] border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={r.ok ? (i % 2 === 0 ? 'bg-white' : 'bg-gray-50') : 'bg-red-50'}>
                    <td className="px-3 py-1.5">{r.ok ? '✅' : '❌'}</td>
                    <td className="px-3 py-1.5 font-medium text-[#1E293B]">{r.item_name}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold">{r.quantity}</td>
                    <td className="px-3 py-1.5 font-mono text-[#64748B] text-[11px] whitespace-nowrap">
                      {r.ok ? `${r.before} → ${r.after}` : '-'}
                    </td>
                    <td className={`px-3 py-1.5 text-[11px] ${r.ok ? 'text-[#475569]' : 'text-red-600 font-medium'}`}>
                      {r.ok ? (r.reason || '') : (r.error ?? '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 이력 조회 탭 ──────────────────────────────────────────────────────────────
function HistoryTab({ user }: { user: SessionUser }) {
  const userCenter         = user.assigned_center ?? user.center
  const isAdminOrMaterials = user.role === 'admin' || user.role === 'materials'

  const [data,    setData]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [center,   setCenter]  = useState(isAdminOrMaterials ? '전체' : userCenter)
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo,   setDateTo]   = useState(today())
  const [search,   setSearch]   = useState('')
  const [limit,    setLimit]    = useState('200')

  const fetchData = async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ limit })
      const targetCenter = isAdminOrMaterials ? center : userCenter
      if (targetCenter && targetCenter !== '전체') params.set('center', targetCenter)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo)   params.set('date_to',   dateTo)
      const res  = await fetch(`/api/usage?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json.data)
    } catch (e: unknown) {
      setError((e as Error).message || '오류가 발생했습니다.')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [center, limit, dateFrom, dateTo])

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter(h =>
      (h.warehouse?.item_name ?? '').toLowerCase().includes(q) ||
      (h.users?.name          ?? '').toLowerCase().includes(q) ||
      (h.reason               ?? '').toLowerCase().includes(q)
    )
  }, [data, search])

  const handleCsvDownload = () => {
    const headers = ['일시','센터','담당자','자재명','사용수량','변경전','변경후','사유']
    const csvRows = filtered.map(h => ([
      tsKst(h.acted_at),
      h.from_center ?? h.warehouse?.location ?? '',
      h.users?.name ?? '',
      h.warehouse?.item_name ?? '',
      h.quantity,
      h.snapshot_qty_before ?? '',
      h.snapshot_qty_after  ?? '',
      h.reason ?? '',
    ]))
    const csv = [headers, ...csvRows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${center}_사용내역.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3">
      <div className="flex flex-wrap gap-2 items-center">
        {isAdminOrMaterials ? (
          <Select value={center} onValueChange={v => v !== null && setCenter(v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="전체">전체 센터</SelectItem>
              {CENTERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <div className="px-3 py-1.5 border rounded text-sm text-[#1E293B] bg-gray-50 min-w-[120px]">{userCenter}</div>
        )}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#B32646]" />
        <span className="text-gray-400 text-sm">~</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#B32646]" />
        <Input className="w-[200px]" placeholder="자재명 / 담당자 / 사유..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={limit} onValueChange={v => v !== null && setLimit(v)}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>{['100','200','500','1000'].map(n => <SelectItem key={n} value={n}>{n}건</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchData} disabled={loading}>{loading ? '로딩 중...' : '🔄 새로고침'}</Button>
        <Button variant="outline" onClick={handleCsvDownload} disabled={loading || filtered.length === 0}>⬇️ CSV</Button>
      </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{error}</p>}

      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3">
      <div className="flex flex-wrap gap-3 text-[12px]">
        <span className="text-[#64748B]">총 <b className="text-[#1E293B]">{filtered.length.toLocaleString()}</b>건</span>
        {filtered.length > 0 && (
          <span className="text-[#c62828]">출고 합계 <b>{filtered.reduce((s, h) => s + h.quantity, 0).toLocaleString()}</b>개</span>
        )}
      </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 bg-white rounded-lg border border-[#e2e8f0]">데이터 로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400 bg-white rounded-lg border border-[#e2e8f0]">사용내역이 없습니다.</div>
      ) : (
        <div className="bg-white rounded-lg border border-[#e2e8f0] overflow-auto max-h-[600px]">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 bg-[#F8F9FA] z-10">
              <tr>
                {['일시','센터','담당자','자재명','사용수량','변경전','변경후','사유'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold text-[#64748B] border-b border-[rgba(0,0,0,0.08)] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h, i) => (
                <tr key={h.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                  <td className="px-3 py-1.5 whitespace-nowrap font-mono text-[11px] text-[#475569]">{tsKst(h.acted_at)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-[#64748B]">{h.from_center ?? h.warehouse?.location ?? ''}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-[#1E293B]">{h.users?.name ?? ''}</td>
                  <td className="px-3 py-1.5 text-[#1E293B] max-w-[200px] truncate font-medium">{h.warehouse?.item_name ?? ''}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-[#B32646]">{h.quantity.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-[#94A3B8]">{h.snapshot_qty_before ?? ''}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-[#94A3B8]">{h.snapshot_qty_after ?? ''}</td>
                  <td className="px-3 py-1.5 text-[#475569] max-w-[220px] truncate">{h.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function UsageContent({ user }: { user: SessionUser }) {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[#1E293B]">📊 사용내역</h2>
      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload"  className="text-[13px]">📤 업로드 (재고 차감)</TabsTrigger>
          <TabsTrigger value="history" className="text-[13px]">📋 이력 조회</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="mt-4">
          <UploadTab user={user} onDone={() => setRefreshKey(k => k + 1)} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab key={refreshKey} user={user} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
