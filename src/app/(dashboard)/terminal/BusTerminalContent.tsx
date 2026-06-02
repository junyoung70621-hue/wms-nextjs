'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { SessionUser } from '@/lib/session'
import { CENTERS } from '@/constants/centers'
import {
  classifyTerminal, normalizeTrcnId, findTrcnIndex,
  buildPivot, buildCenterPivot, countByCenter,
  XLSX_ROW_ORDER,
  type TerminalMovement, type DevicePivot, type CenterPivot,
} from '@/lib/terminal'

const HUB = '자재센터'
const NON_HUB_CENTERS = CENTERS.filter(c => c !== HUB)

// ── 날짜 유틸 (KST) ────────────────────────────────────────────────────────────
function kstToday(): string {
  const d = new Date(Date.now() + 9 * 3600000)
  return d.toISOString().slice(0, 10)
}
function dateLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}월 ${parseInt(d, 10)}일`
}

async function fetchMovements(params: Record<string, string>): Promise<TerminalMovement[]> {
  const sp = new URLSearchParams(params)
  const r = await fetch(`/api/terminal/movements?${sp.toString()}`)
  const d = await r.json()
  return d.data ?? []
}

// 엑셀 파일 → TRCN_ID 목록 (헤더 행 자동 감지)
function parseExcelFile(file: File): Promise<{ ids: string[]; detected: boolean }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        let headerRow = -1
        let col = -1
        for (let i = 0; i < Math.min(aoa.length, 20); i++) {
          const idx = findTrcnIndex(aoa[i])
          if (idx >= 0) { headerRow = i; col = idx; break }
        }
        if (col < 0) { resolve({ ids: [], detected: false }); return }
        const ids: string[] = []
        for (let k = headerRow + 1; k < aoa.length; k++) {
          const v = normalizeTrcnId(aoa[k][col])
          if (v) ids.push(v)
        }
        resolve({ ids, detected: true })
      } catch (e) { reject(e) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// 표시용 공통 컴포넌트
// ══════════════════════════════════════════════════════════════════════════════

function DevicePivotTable({ pivot, title }: { pivot: DevicePivot; title: string }) {
  if (!pivot.rows.length) {
    return (
      <div>
        <div className="text-[12px] font-bold text-[#1E293B] mb-1.5">{title}</div>
        <div className="text-[11px] text-[#94A3B8] py-3 text-center bg-[#F8F9FA] rounded">데이터 없음</div>
      </div>
    )
  }
  return (
    <div>
      <div className="text-[12px] font-bold text-[#1E293B] mb-1.5">{title}</div>
      <div className="overflow-x-auto rounded border border-[#E2E8F0]">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-[#F8F9FA] text-[#64748B]">
              <th className="px-2 py-1.5 text-left font-semibold border-b border-[#E2E8F0]">종류</th>
              {pivot.subTypes.map(s => (
                <th key={s} className="px-2 py-1.5 text-center font-semibold border-b border-[#E2E8F0]">{s}</th>
              ))}
              <th className="px-2 py-1.5 text-center font-semibold border-b border-[#E2E8F0] bg-[#FEF3F6] text-[#B32646]">합계</th>
            </tr>
          </thead>
          <tbody>
            {pivot.rows.map(r => (
              <tr key={r.device} className="border-b border-[#F1F5F9]">
                <td className="px-2 py-1.5 font-semibold text-[#1E293B]">{r.device}</td>
                {r.cells.map((c, i) => (
                  <td key={i} className={`px-2 py-1.5 text-center ${c > 0 ? 'text-[#1E293B]' : 'text-[#CBD5E1]'}`}>
                    {c > 0 ? c : ''}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center font-bold text-[#B32646]">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CenterCrossTable({ pivot, date, title }: { pivot: CenterPivot | null; date: string; title: string }) {
  if (!pivot || !pivot.rows.length) {
    return (
      <div>
        <div className="text-[12px] font-bold text-[#1E293B] mb-1.5">{title}</div>
        <div className="text-[11px] text-[#94A3B8] py-3 text-center bg-[#F8F9FA] rounded">데이터 없음</div>
      </div>
    )
  }
  return (
    <div>
      <div className="text-[12px] font-bold text-[#1E293B] mb-1.5">{title}</div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[12px]">
          <thead>
            <tr>
              <th colSpan={pivot.centers.length + 1}
                  className="px-3 py-1.5 text-center font-bold border border-[#f0c0d0] bg-[#FCE4ED] text-[#B32646]">
                {dateLabel(date)}
              </th>
            </tr>
            <tr>
              <th className="px-2 py-1.5 text-center font-semibold border border-[#E2E8F0] bg-[#F8F9FA] text-[#64748B] min-w-[80px]">종류</th>
              {pivot.centers.map(c => (
                <th key={c} className="px-2 py-1.5 text-center font-semibold border border-[#E2E8F0] bg-[#F8F9FA] text-[#1E293B] min-w-[48px]">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pivot.rows.map(r => (
              <tr key={r.rowKey}>
                <td className="px-2.5 py-1.5 text-left font-semibold border border-[#E2E8F0] bg-[#FEF3F6] text-[#B32646]">{r.rowKey}</td>
                {r.cells.map((c, i) => (
                  <td key={i} className={`px-2 py-1.5 text-center border border-[#E2E8F0] ${c > 0 ? 'text-[#1E293B]' : 'text-[#CBD5E1]'}`}>
                    {c > 0 ? c : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CenterCountList({ rows, field, label }: { rows: TerminalMovement[]; field: 'from_center' | 'to_center'; label: string }) {
  const counts = countByCenter(rows, field)
  if (!counts.length) return null
  return (
    <div className="text-[11px]">
      <div className="text-[#64748B] font-semibold mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {counts.map(c => (
          <span key={c.center} className="px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569]">
            {c.center} <b className="text-[#B32646]">{c.count}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 업로드 패널
// ══════════════════════════════════════════════════════════════════════════════

function UploadPanel({
  direction, perms, onSaved,
}: {
  direction: 'in' | 'out'
  perms: Perms
  onSaved: () => void
}) {
  const [date, setDate] = useState(kstToday())
  // out: 도착센터 선택 / in: 출발센터 (권한 없으면 본인 센터 고정)
  const selectableCenters = direction === 'out'
    ? NON_HUB_CENTERS
    : (perms.canSelIn ? NON_HUB_CENTERS : [perms.center])
  const [center, setCenter] = useState(selectableCenters[0] ?? '')
  const [ids, setIds] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [manualText, setManualText] = useState('')
  const [notes, setNotes] = useState('')
  const [force, setForce] = useState(false)
  const [dups, setDups] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const classified = useMemo(() => ids.map(id => ({ id, ...classifyTerminal(id) })), [ids])
  const validCount = classified.filter(c => c.device !== '미분류').length
  const invalid = classified.filter(c => c.device === '미분류')

  const fromCenter = direction === 'out' ? HUB : center
  const toCenter = direction === 'out' ? center : HUB

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setMsg(''); setDups(null); setForce(false)
    try {
      const { ids: parsed, detected } = await parseExcelFile(file)
      if (!detected) { setMsg('단말기ID 컬럼을 찾지 못했습니다.'); setIds([]); return }
      setIds(parsed)
    } catch { setMsg('파일 읽기 실패'); setIds([]) }
  }

  function applyManual() {
    const parsed = manualText.split(/[\n,\s]+/).map(normalizeTrcnId).filter(Boolean)
    setIds(parsed); setFileName(''); setMsg(''); setDups(null); setForce(false)
  }

  async function save() {
    if (!validCount) { setMsg('유효한 단말기ID가 없습니다.'); return }
    setBusy(true); setMsg('')
    try {
      const validIds = classified.filter(c => c.device !== '미분류').map(c => c.id)
      // 1차: 중복 확인
      if (dups === null) {
        const r = await fetch('/api/terminal/movements/check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction, upload_date: date, trcn_ids: validIds }),
        })
        const d = await r.json()
        const dl: string[] = d.dups ?? []
        setDups(dl)
        if (dl.length && !force) {
          setMsg(`중복 ${dl.length}건이 있습니다. "중복 무시" 체크 후 다시 저장하세요.`)
          setBusy(false); return
        }
      }
      // 저장
      const r = await fetch('/api/terminal/movements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction, upload_date: date, from_center: fromCenter, to_center: toCenter,
          file_name: fileName || null, notes: notes || null, trcn_ids: validIds, force,
        }),
      })
      const d = await r.json()
      if (d.error) { setMsg(d.error); setBusy(false); return }
      let m = `저장 완료: ${d.inserted}건`
      if (d.unclassified) m += ` · 미분류 제외 ${d.unclassified}건`
      if (d.dups) m += ` · 중복 ${d.dups}건`
      if (d.autoReturned) m += ` · 자동반납 ${d.autoReturned}건`
      setMsg(m)
      setIds([]); setFileName(''); setManualText(''); setNotes(''); setDups(null); setForce(false)
      if (fileRef.current) fileRef.current.value = ''
      onSaved()
    } catch { setMsg('저장 실패') }
    setBusy(false)
  }

  return (
    <div className="space-y-3 p-3 bg-[#FAFAFA] rounded-lg border border-[#E2E8F0]">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[11px] text-[#64748B] block mb-0.5">{direction === 'out' ? '도착센터' : '출발센터'}</label>
          <Select value={center} onValueChange={v => v !== null && setCenter(v)}>
            <SelectTrigger className="h-8 text-[12px] w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {selectableCenters.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] block mb-0.5">이동 날짜</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
                 className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2" />
        </div>
        <div className="text-[11px] text-[#94A3B8]">{fromCenter} → {toCenter}</div>
      </div>

      {/* 엑셀 업로드 */}
      <div>
        <label className="text-[11px] text-[#64748B] block mb-0.5">엑셀 파일 (.xlsx / .xls)</label>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="text-[12px]" />
      </div>
      {/* 직접 입력 */}
      <div>
        <label className="text-[11px] text-[#64748B] block mb-0.5">또는 직접 입력 (줄바꿈/쉼표 구분)</label>
        <div className="flex gap-2">
          <textarea value={manualText} onChange={e => setManualText(e.target.value)}
                    rows={2} className="flex-1 text-[12px] border border-[#E2E8F0] rounded px-2 py-1"
                    placeholder="560002215, 445001234 ..." />
          <Button type="button" variant="outline" className="h-8 text-[12px] self-end" onClick={applyManual}>적용</Button>
        </div>
      </div>

      {ids.length > 0 && (
        <div className="text-[11px] flex flex-wrap gap-3">
          <span className="text-[#1565c0]">유효 <b>{validCount}</b></span>
          {invalid.length > 0 && <span className="text-[#c62828]">미분류 <b>{invalid.length}</b></span>}
          <span className="text-[#94A3B8]">전체 {ids.length}</span>
        </div>
      )}
      {invalid.length > 0 && (
        <div className="text-[10px] text-[#94A3B8] max-h-20 overflow-y-auto">
          미분류: {invalid.slice(0, 30).map(i => i.id).join(', ')}{invalid.length > 30 ? ' …' : ''}
        </div>
      )}

      <div>
        <label className="text-[11px] text-[#64748B] block mb-0.5">비고 (선택)</label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-[12px]" placeholder="메모" />
      </div>

      {dups !== null && dups.length > 0 && (
        <div className="flex items-center gap-2 text-[11px]">
          <Checkbox checked={force} onCheckedChange={v => setForce(!!v)} id={`force-${direction}`} />
          <label htmlFor={`force-${direction}`} className="text-[#c62828]">중복 {dups.length}건 무시하고 강제 저장</label>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" disabled={busy || !validCount} onClick={save} className="h-8 text-[12px]">
          {busy ? '저장 중…' : '저장'}
        </Button>
        {msg && <span className="text-[11px] text-[#475569]">{msg}</span>}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 관리(편집/삭제) 패널
// ══════════════════════════════════════════════════════════════════════════════

function ManagePanel({ rows, perms, onChanged }: { rows: TerminalMovement[]; perms: Perms; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)

  // upload_id 별 그룹
  const groups = useMemo(() => {
    const m = new Map<string, TerminalMovement[]>()
    for (const r of rows) {
      if (!m.has(r.upload_id)) m.set(r.upload_id, [])
      m.get(r.upload_id)!.push(r)
    }
    return [...m.entries()]
  }, [rows])

  async function delBatch(uploadId: string) {
    if (!confirm('이 업로드 배치를 삭제할까요?')) return
    setBusy(true)
    await fetch('/api/terminal/movements', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_id: uploadId }),
    })
    setBusy(false); onChanged()
  }
  async function delOne(id: string) {
    setBusy(true)
    await fetch('/api/terminal/movements', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setBusy(false); onChanged()
  }

  const canManage = (r: TerminalMovement) => perms.isAdmin || perms.isJjae || r.uploaded_by === perms.userId

  if (!groups.length) return <div className="text-[11px] text-[#94A3B8] py-3 text-center">관리할 업로드 내역이 없습니다.</div>

  return (
    <div className="space-y-2">
      {groups.map(([uid, recs]) => {
        const manageable = recs.some(canManage)
        return (
          <div key={uid} className="border border-[#E2E8F0] rounded-lg p-2.5 bg-white">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] text-[#475569]">
                <b>{recs[0].file_name || '직접입력'}</b> · {recs.length}건 · {recs[0].upload_date}
              </div>
              {manageable && (
                <Button type="button" variant="outline" disabled={busy}
                        className="h-6 text-[10px] text-[#c62828]" onClick={() => delBatch(uid)}>배치 삭제</Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {recs.slice(0, 60).map(r => (
                <span key={r.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[10px] text-[#475569]">
                  <span className="font-mono">{r.trcn_id}</span>
                  <span className="text-[#94A3B8]">{r.device_type}/{r.sub_type}</span>
                  {canManage(r) && (
                    <button type="button" className="text-[#c62828] hover:underline" disabled={busy} onClick={() => delOne(r.id)}>×</button>
                  )}
                </span>
              ))}
              {recs.length > 60 && <span className="text-[10px] text-[#94A3B8]">+{recs.length - 60}건</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Excel 내보내기
// ══════════════════════════════════════════════════════════════════════════════

function exportHistory(rows: TerminalMovement[], from: string, to: string) {
  const data = rows.map(r => ({
    이동날짜: r.upload_date,
    방향: r.direction === 'out' ? '출고' : '입고',
    출발센터: r.from_center,
    도착센터: r.to_center,
    종류: r.device_type,
    유형: r.sub_type,
    TRCN_ID: r.trcn_id,
    파일명: r.file_name ?? '',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '이력')
  XLSX.writeFile(wb, `단말기이력_${from}_${to}.xlsx`)
}

function pivotToAoa(pivot: DevicePivot): unknown[][] {
  const head = ['종류', ...pivot.subTypes, '합계']
  const body = pivot.rows.map(r => [r.device, ...r.cells, r.total])
  return [head, ...body]
}

function exportMonthly(out: TerminalMovement[], inn: TerminalMovement[], daily: DailyRow[], ym: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.json_to_sheet(daily.map(d => ({ 날짜: d.date, 출고: d.out, 입고: d.in, 합계: d.out + d.in }))),
    '일별추이')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pivotToAoa(buildPivot(out))), '기종별_출고')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pivotToAoa(buildPivot(inn))), '기종별_입고')
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.json_to_sheet(countByCenter(out, 'to_center').map(c => ({ 센터: c.center, 수량: c.count }))), '센터별_출고')
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.json_to_sheet(countByCenter(inn, 'from_center').map(c => ({ 센터: c.center, 수량: c.count }))), '센터별_입고')
  XLSX.writeFile(wb, `단말기월간통계_${ym}.xlsx`)
}

// 인수인계증 (값 기반, 종류별 요약 + IH 목록)
function safeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31)
}
function buildCertSheet(rows: TerminalMovement[], fromC: string, toC: string, date: string, notes: string): XLSX.WorkSheet {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(`${r.device_type}|${r.sub_type}`, (counts.get(`${r.device_type}|${r.sub_type}`) ?? 0) + 1)
  const aoa: unknown[][] = []
  aoa.push(['인수인계증'])
  aoa.push(['인계센터', fromC, '인수센터', toC])
  aoa.push(['일자', date, '총수량', rows.length])
  aoa.push([])
  aoa.push(['No', '단말기종류', '유형', '수량'])
  let no = 1
  for (const [device, sub] of XLSX_ROW_ORDER) {
    const c = counts.get(`${device}|${sub}`) ?? 0
    if (c > 0) { aoa.push([no++, device, sub, c]); counts.delete(`${device}|${sub}`) }
  }
  for (const [k, c] of counts) {
    const [device, sub] = k.split('|')
    if (c > 0) aoa.push([no++, device, sub, c])
  }
  aoa.push(['', '', '합계', rows.length])
  aoa.push([])
  if (notes) { aoa.push(['비고', notes]); aoa.push([]) }
  aoa.push(['단말기 IH 목록'])
  aoa.push(['No', 'IH'])
  const sorted = [...rows].map(r => r.trcn_id).sort()
  sorted.forEach((ih, i) => aoa.push([i + 1, ih]))
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 10 }]
  return ws
}
function exportHandover(rows: TerminalMovement[], fromC: string, toC: string, date: string, notes: string, perCenter: 'from' | 'to' | null) {
  const wb = XLSX.utils.book_new()
  if (perCenter) {
    const field = perCenter === 'to' ? 'to_center' : 'from_center'
    XLSX.utils.book_append_sheet(wb, buildCertSheet(rows, fromC, toC, date, notes), '전체요약')
    const byCenter = new Map<string, TerminalMovement[]>()
    for (const r of rows) {
      const k = r[field]
      if (!byCenter.has(k)) byCenter.set(k, [])
      byCenter.get(k)!.push(r)
    }
    for (const [c, recs] of byCenter) {
      const f = perCenter === 'to' ? fromC : c
      const t = perCenter === 'to' ? c : toC
      XLSX.utils.book_append_sheet(wb, buildCertSheet(recs, f, t, date, notes), safeSheetName(c))
    }
  } else {
    XLSX.utils.book_append_sheet(wb, buildCertSheet(rows, fromC, toC, date, notes), '인수인계증')
  }
  XLSX.writeFile(wb, `인수인계증_${date}_${fromC}→${toC}.xlsx`)
}

// ══════════════════════════════════════════════════════════════════════════════
// 메인
// ══════════════════════════════════════════════════════════════════════════════

interface Perms {
  userId: string
  center: string
  isAdmin: boolean
  isJjae: boolean
  canUpOut: boolean
  canUpIn: boolean
  canSelIn: boolean
}
interface DailyRow { date: string; out: number; in: number }

export default function BusTerminalContent({ user }: { user: SessionUser }) {
  const center = user.assigned_center ?? user.center
  const perms: Perms = useMemo(() => {
    const isAdmin = user.role === 'admin'
    const isJjae = center === HUB
    return {
      userId: user.id, center, isAdmin, isJjae,
      canUpOut: isAdmin || (isJjae && user.role !== 'guest'),
      canUpIn: user.role !== 'guest',
      canSelIn: isAdmin || isJjae,
    }
  }, [user, center])

  return (
    <div className="space-y-4">
      <Tabs defaultValue="today">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="today" className="text-[12px]">📊 오늘의 현황</TabsTrigger>
          <TabsTrigger value="monthly" className="text-[12px]">📈 월간 현황</TabsTrigger>
          <TabsTrigger value="history" className="text-[12px]">📋 이력 조회</TabsTrigger>
          <TabsTrigger value="cert" className="text-[12px]">📄 인수인계증</TabsTrigger>
          {perms.isAdmin && <TabsTrigger value="admin" className="text-[12px]">⚙️ 관리</TabsTrigger>}
        </TabsList>

        <TabsContent value="today" className="mt-4"><TodayTab perms={perms} /></TabsContent>
        <TabsContent value="monthly" className="mt-4"><MonthlyTab /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryTab /></TabsContent>
        <TabsContent value="cert" className="mt-4"><CertTab perms={perms} /></TabsContent>
        {perms.isAdmin && <TabsContent value="admin" className="mt-4"><AdminTab /></TabsContent>}
      </Tabs>
    </div>
  )
}

// ── 탭1: 오늘의 현황 ──────────────────────────────────────────────────────────
function TodayTab({ perms }: { perms: Perms }) {
  const [date, setDate] = useState(kstToday())
  const [out, setOut] = useState<TerminalMovement[]>([])
  const [inn, setInn] = useState<TerminalMovement[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [o, i] = await Promise.all([
      fetchMovements({ direction: 'out', date }),
      fetchMovements({ direction: 'in', date }),
    ])
    setOut(o); setInn(i); setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  const outCenterPivot = useMemo(() => buildCenterPivot(out, 'out'), [out])
  const inCenterPivot = useMemo(() => buildCenterPivot(inn, 'in'), [inn])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
               className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2" />
        <Button type="button" variant="outline" className="h-8 text-[12px]" onClick={load}>새로고침</Button>
        <span className="text-[11px] text-[#94A3B8] ml-auto">출고 {out.length} · 입고 {inn.length}</span>
      </div>

      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중…</div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <CenterCrossTable pivot={outCenterPivot} date={date} title="📤 센터별 출고 현황" />
              <DevicePivotTable pivot={buildPivot(out)} title="출고 기종별" />
              <CenterCountList rows={out} field="to_center" label="출고 센터별" />
            </div>
            <div className="space-y-3">
              <CenterCrossTable pivot={inCenterPivot} date={date} title="📥 센터별 입고 현황" />
              <DevicePivotTable pivot={buildPivot(inn)} title="입고 기종별" />
              <CenterCountList rows={inn} field="from_center" label="입고 센터별" />
            </div>
          </div>

          {(perms.canUpOut || perms.canUpIn) && (
            <div className="grid md:grid-cols-2 gap-5 pt-2">
              {perms.canUpOut && (
                <div className="space-y-2">
                  <div className="text-[12px] font-bold text-[#1E293B]">📤 출고 업로드</div>
                  <UploadPanel direction="out" perms={perms} onSaved={load} />
                  <ManagePanel rows={out} perms={perms} onChanged={load} />
                </div>
              )}
              {perms.canUpIn && (
                <div className="space-y-2">
                  <div className="text-[12px] font-bold text-[#1E293B]">📥 입고 업로드</div>
                  <UploadPanel direction="in" perms={perms} onSaved={load} />
                  <ManagePanel rows={inn} perms={perms} onChanged={load} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── 탭2: 월간 현황 ────────────────────────────────────────────────────────────
function MonthlyTab() {
  const now = new Date(Date.now() + 9 * 3600000)
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(now.getUTCMonth() + 1)
  const [out, setOut] = useState<TerminalMovement[]>([])
  const [inn, setInn] = useState<TerminalMovement[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const first = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const last = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const [o, i] = await Promise.all([
      fetchMovements({ direction: 'out', from: first, to: last, limit: '10000' }),
      fetchMovements({ direction: 'in', from: first, to: last, limit: '10000' }),
    ])
    setOut(o); setInn(i); setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const daily: DailyRow[] = useMemo(() => {
    const m = new Map<string, { out: number; in: number }>()
    for (const r of out) { const e = m.get(r.upload_date) ?? { out: 0, in: 0 }; e.out++; m.set(r.upload_date, e) }
    for (const r of inn) { const e = m.get(r.upload_date) ?? { out: 0, in: 0 }; e.in++; m.set(r.upload_date, e) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, out: v.out, in: v.in }))
  }, [out, inn])

  const years = [now.getUTCFullYear() - 2, now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(year)} onValueChange={v => v !== null && setYear(Number(v))}>
          <SelectTrigger className="h-8 text-[12px] w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)} className="text-[12px]">{y}년</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={v => v !== null && setMonth(Number(v))}>
          <SelectTrigger className="h-8 text-[12px] w-20"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <SelectItem key={m} value={String(m)} className="text-[12px]">{m}월</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" variant="outline" className="h-8 text-[12px]"
                disabled={!out.length && !inn.length}
                onClick={() => exportMonthly(out, inn, daily, `${year}${String(month).padStart(2, '0')}`)}>
          엑셀 내보내기
        </Button>
        <span className="text-[11px] text-[#94A3B8] ml-auto">출고 {out.length} · 입고 {inn.length}</span>
      </div>

      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중…</div>
      ) : (
        <>
          <div>
            <div className="text-[12px] font-bold text-[#1E293B] mb-1.5">일별 추이</div>
            {daily.length ? (
              <div className="overflow-x-auto rounded border border-[#E2E8F0]">
                <table className="w-full text-[11px]">
                  <thead><tr className="bg-[#F8F9FA] text-[#64748B]">
                    <th className="px-2 py-1.5 text-left font-semibold">날짜</th>
                    <th className="px-2 py-1.5 text-right font-semibold">출고</th>
                    <th className="px-2 py-1.5 text-right font-semibold">입고</th>
                    <th className="px-2 py-1.5 text-right font-semibold">합계</th>
                  </tr></thead>
                  <tbody>{daily.map(d => (
                    <tr key={d.date} className="border-t border-[#F1F5F9]">
                      <td className="px-2 py-1.5 text-[#1E293B]">{d.date}</td>
                      <td className="px-2 py-1.5 text-right text-[#1565c0]">{d.out}</td>
                      <td className="px-2 py-1.5 text-right text-[#16a34a]">{d.in}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-[#B32646]">{d.out + d.in}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className="text-[11px] text-[#94A3B8] py-3 text-center bg-[#F8F9FA] rounded">데이터 없음</div>}
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            <DevicePivotTable pivot={buildPivot(out)} title="기종별 출고" />
            <DevicePivotTable pivot={buildPivot(inn)} title="기종별 입고" />
          </div>
        </>
      )}
    </div>
  )
}

// ── 탭3: 이력 조회 ────────────────────────────────────────────────────────────
function HistoryTab() {
  const today = kstToday()
  const ago = new Date(Date.now() + 9 * 3600000 - 30 * 86400000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(ago)
  const [to, setTo] = useState(today)
  const [dir, setDir] = useState('전체')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<TerminalMovement[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params: Record<string, string> = { from, to, limit: '3000' }
    if (dir === '출고') params.direction = 'out'
    if (dir === '입고') params.direction = 'in'
    setRows(await fetchMovements(params)); setLoading(false)
  }, [from, to, dir])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      [r.trcn_id, r.from_center, r.to_center, r.device_type, r.sub_type, r.file_name ?? '']
        .some(v => String(v).toLowerCase().includes(q)))
  }, [rows, search])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2" />
        <span className="text-[#94A3B8]">~</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2" />
        <Select value={dir} onValueChange={v => v !== null && setDir(v)}>
          <SelectTrigger className="h-8 text-[12px] w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['전체', '출고', '입고'].map(d => <SelectItem key={d} value={d} className="text-[12px]">{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" className="h-8 text-[12px]" onClick={load}>조회</Button>
        <Input placeholder="검색 (ID/센터/종류)" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-[12px] w-44" />
        <Button type="button" variant="outline" className="h-8 text-[12px]" disabled={!filtered.length}
                onClick={() => exportHistory(filtered, from, to)}>엑셀</Button>
        <span className="text-[11px] text-[#94A3B8] ml-auto">{filtered.length}건</span>
      </div>

      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중…</div>
      ) : (
        <div className="overflow-x-auto rounded border border-[#E2E8F0]">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-[#F8F9FA] text-[#64748B]">
              <th className="px-2 py-1.5 text-left font-semibold">날짜</th>
              <th className="px-2 py-1.5 text-left font-semibold">방향</th>
              <th className="px-2 py-1.5 text-left font-semibold">출발</th>
              <th className="px-2 py-1.5 text-left font-semibold">도착</th>
              <th className="px-2 py-1.5 text-left font-semibold">종류</th>
              <th className="px-2 py-1.5 text-left font-semibold">유형</th>
              <th className="px-2 py-1.5 text-left font-semibold">TRCN_ID</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-2 py-6 text-center text-[#94A3B8]">데이터 없음</td></tr>
              ) : filtered.slice(0, 1000).map(r => (
                <tr key={r.id} className="border-t border-[#F1F5F9]">
                  <td className="px-2 py-1.5 text-[#475569]">{r.upload_date}</td>
                  <td className={`px-2 py-1.5 ${r.direction === 'out' ? 'text-[#1565c0]' : 'text-[#16a34a]'}`}>{r.direction === 'out' ? '출고' : '입고'}</td>
                  <td className="px-2 py-1.5 text-[#475569]">{r.from_center}</td>
                  <td className="px-2 py-1.5 text-[#475569]">{r.to_center}</td>
                  <td className="px-2 py-1.5 text-[#1E293B]">{r.device_type}</td>
                  <td className="px-2 py-1.5 text-[#64748B]">{r.sub_type}</td>
                  <td className="px-2 py-1.5 font-mono text-[#475569]">{r.trcn_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 1000 && <div className="text-[10px] text-[#94A3B8] p-2 text-center">상위 1000건만 표시 (엑셀로 전체 내보내기)</div>}
        </div>
      )}
    </div>
  )
}

// ── 탭4: 인수인계증 ───────────────────────────────────────────────────────────
function CertTab({ perms }: { perms: Perms }) {
  const [date, setDate] = useState(kstToday())
  const [dir, setDir] = useState<'in' | 'out'>(perms.isJjae ? 'out' : 'in')
  const [centerFilter, setCenterFilter] = useState(perms.isAdmin || perms.isJjae ? '전체' : perms.center)
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<TerminalMovement[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let r = await fetchMovements({ direction: dir, date })
    if (centerFilter !== '전체') {
      const field = dir === 'out' ? 'to_center' : 'from_center'
      r = r.filter(x => x[field] === centerFilter)
    }
    setRows(r); setLoading(false)
  }, [date, dir, centerFilter])

  useEffect(() => { load() }, [load])

  function download() {
    const fromC = dir === 'out' ? HUB : (centerFilter === '전체' ? '타센터' : centerFilter)
    const toC = dir === 'out' ? (centerFilter === '전체' ? '타센터' : centerFilter) : HUB
    const perCenter = centerFilter === '전체' ? (dir === 'out' ? 'to' : 'from') : null
    exportHandover(rows, fromC, toC, date, notes, perCenter)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2" />
        <Select value={dir} onValueChange={v => v !== null && setDir(v as 'in' | 'out')}>
          <SelectTrigger className="h-8 text-[12px] w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="out" className="text-[12px]">출고</SelectItem>
            <SelectItem value="in" className="text-[12px]">입고</SelectItem>
          </SelectContent>
        </Select>
        <Select value={centerFilter} onValueChange={v => v !== null && setCenterFilter(v)}>
          <SelectTrigger className="h-8 text-[12px] w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['전체', ...NON_HUB_CENTERS].map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" className="h-8 text-[12px]" onClick={load}>조회</Button>
        <Button type="button" className="h-8 text-[12px]" disabled={!rows.length} onClick={download}>인수인계증 다운로드</Button>
        <span className="text-[11px] text-[#94A3B8] ml-auto">{rows.length}건</span>
      </div>
      <Input placeholder="비고 (선택)" value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-[12px] max-w-md" />

      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중…</div>
      ) : (
        <DevicePivotTable pivot={buildPivot(rows)} title={`${dir === 'out' ? '출고' : '입고'} · ${centerFilter} · ${dateLabel(date)}`} />
      )}
    </div>
  )
}

// ── 탭5: 관리 (모뎀 재분류) ───────────────────────────────────────────────────
interface ReclassChange { id: string; trcn_id: string; old_device: string; old_sub: string; new_device: string; new_sub: string }
function AdminTab() {
  const [changes, setChanges] = useState<ReclassChange[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function preview() {
    setBusy(true); setMsg('')
    const r = await fetch('/api/terminal/reclassify')
    const d = await r.json()
    setChanges(d.changes ?? []); setBusy(false)
  }
  async function apply() {
    if (!changes?.length) return
    setBusy(true); setMsg('')
    const r = await fetch('/api/terminal/reclassify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: changes.map(c => ({ id: c.id, device_type: c.new_device, sub_type: c.new_sub })) }),
    })
    const d = await r.json()
    setMsg(`적용 ${d.updated}건${d.failed ? ` · 실패 ${d.failed}건` : ''}`)
    setChanges(null); setBusy(false)
  }

  return (
    <div className="space-y-3">
      <div className="text-[12px] text-[#64748B]">'모뎀'으로 저장된 단말기를 현재 분류 규칙으로 재분류합니다.</div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" className="h-8 text-[12px]" disabled={busy} onClick={preview}>미리보기</Button>
        {changes && changes.length > 0 && (
          <Button type="button" className="h-8 text-[12px]" disabled={busy} onClick={apply}>{changes.length}건 일괄 변경</Button>
        )}
        {msg && <span className="text-[11px] text-[#475569]">{msg}</span>}
      </div>
      {changes && (
        changes.length === 0 ? (
          <div className="text-[11px] text-[#94A3B8]">변경할 항목이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-[#E2E8F0] max-h-96">
            <table className="w-full text-[11px]">
              <thead><tr className="bg-[#F8F9FA] text-[#64748B]">
                <th className="px-2 py-1.5 text-left font-semibold">TRCN_ID</th>
                <th className="px-2 py-1.5 text-left font-semibold">기존</th>
                <th className="px-2 py-1.5 text-left font-semibold">변경</th>
              </tr></thead>
              <tbody>{changes.slice(0, 500).map(c => (
                <tr key={c.id} className="border-t border-[#F1F5F9]">
                  <td className="px-2 py-1.5 font-mono text-[#475569]">{c.trcn_id}</td>
                  <td className="px-2 py-1.5 text-[#94A3B8]">{c.old_device}/{c.old_sub}</td>
                  <td className="px-2 py-1.5 text-[#B32646] font-semibold">{c.new_device}/{c.new_sub}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
