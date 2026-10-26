'use client'

import { useState, useEffect, useCallback } from 'react'
import { classifyTaxi } from '@/lib/taxiTracking'
import { classifyTerminal } from '@/lib/terminal'

// 박스(창고 자재) 최소 형태 — 재고현황/자재창고지도 양쪽 Item 이 모두 만족
export type BoxItem = {
  id: number
  rack_no: string | null
  shelf: string | null
  box_no: string | null
  category_large: string | null
  category_small: string | null
}

type BoxTerminal = { id: string; trcn_id: string; device_type: string | null; source: string }

// 박스 대분류(버스/택시)에 맞게 IH가 인식되는지 — 서버 recognizedForBox 와 동일 규칙
export function recognizedForBox(categoryLarge: string | null, ih: string): boolean {
  const isTaxi = classifyTaxi(ih) !== '미분류'
  const isBus = classifyTerminal(ih).device !== '미분류'
  const c = categoryLarge ?? ''
  if (c.includes('택시')) return isTaxi
  if (c.includes('버스')) return isBus
  return isTaxi || isBus // 대분류 불명확 시 둘 중 하나라도 인식되면 허용
}

// 단말기 분류 박스: IH(단말기 번호) + 기종 입력/목록/삭제
// 재고현황 페이지와 자재창고 지도가 같은 박스(box_terminals, warehouse_id/좌표 기준)를 공유한다.
export default function TerminalBoxSection({ item, canEdit, location, onChanged }: {
  item: BoxItem; canEdit: boolean; location: string; onChanged: () => void
}) {
  const [list, setList] = useState<BoxTerminal[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [device, setDevice] = useState(item.category_small ?? '')
  const [ihText, setIhText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  // 마지막 삭제 묶음 (되돌리기용)
  type Deleted = {
    trcn_id: string; device_type: string | null; source: string
    warehouse_id: number | null; location: string | null; rack_no: string | null; shelf: string | null; box_no: string | null
  }
  const [undo, setUndo] = useState<Deleted[]>([])

  // 위치(랙/박스)가 있으면 좌표 기준(택시 지정분 포함), 없으면 warehouse_id 기준
  const query = item.rack_no
    ? `rack_no=${encodeURIComponent(item.rack_no)}&shelf=${encodeURIComponent(item.shelf ?? '')}&box_no=${encodeURIComponent(item.box_no ?? '')}&location=${encodeURIComponent(location)}`
    : `warehouse_id=${item.id}`

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const res = await fetch(`/api/box-terminals?${query}`)
      const d = await res.json()
      if (!res.ok) { setErr(d.error || '조회 실패'); setList([]) }
      else setList(d.data ?? [])
    } catch { setErr('조회 실패') }
    finally { setLoading(false) }
  }, [query])
  useEffect(() => { load() }, [load])

  async function add() {
    const ids = ihText.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)
    if (!ids.length) return
    // 박스 종류(버스/택시)에 맞지 않거나 인식 안 되는 단말기는 미리 차단
    const ok = ids.filter(id => recognizedForBox(item.category_large, id))
    const blocked = ids.filter(id => !recognizedForBox(item.category_large, id))
    if (!ok.length) {
      setErr(`이 박스(${item.category_large ?? '단말기'})에 맞지 않거나 인식되지 않는 단말기는 추가할 수 없습니다: ${blocked.join(', ')}`)
      return
    }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/box-terminals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse_id: item.id, device_type: device, trcn_ids: ok }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || '추가 실패'); return }
      setIhText('')
      setErr(blocked.length ? `일부 제외됨(박스 종류 불일치/미인식): ${blocked.join(', ')}` : '')
      await load(); onChanged()
    } catch { setErr('추가 실패') }
    finally { setBusy(false) }
  }
  async function remove(ids: string[]) {
    if (!ids.length) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/box-terminals', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || '삭제 실패'); return }
      setUndo(d.deleted ?? [])
      setSel(new Set())
      await load(); onChanged()
    } catch { setErr('삭제 실패') }
    finally { setBusy(false) }
  }
  // 되돌리기: 마지막 삭제분을 원래 박스(warehouse_id 또는 좌표)·출처별로 묶어 재등록
  async function restore() {
    if (!undo.length) return
    setBusy(true); setErr('')
    try {
      const groups = new Map<string, Deleted[]>()
      for (const r of undo) {
        const k = `${r.warehouse_id ?? ''}|${r.source}`
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k)!.push(r)
      }
      for (const g of groups.values()) {
        const h = g[0]
        const target = h.warehouse_id
          ? { warehouse_id: h.warehouse_id }
          : { location: h.location, rack_no: h.rack_no, shelf: h.shelf, box_no: h.box_no }
        const res = await fetch('/api/box-terminals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...target, source: h.source, items: g.map(r => ({ trcn_id: r.trcn_id, device_type: r.device_type })) }),
        })
        const d = await res.json()
        if (!res.ok) { setErr(d.error || '되돌리기 실패'); return }
      }
      setUndo([])
      await load(); onChanged()
    } catch { setErr('되돌리기 실패') }
    finally { setBusy(false) }
  }
  function toggle(id: string) {
    setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  return (
    <div className="border-t border-[#E3E1DE] pt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-bold text-[#111111]">📟 박스 내 단말기</span>
        <span className="text-[11px] text-[#8A949C]">{list.length}개</span>
        {canEdit && (
          <span className="ml-auto flex items-center gap-1">
            {list.length > 0 && (
              <>
                <button type="button" disabled={busy}
                  onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map(t => t.id)))}
                  className="h-6 px-2 text-[11px] rounded border border-[#E3E1DE] text-[#2F3941] hover:bg-[#F1F1F0]">
                  {sel.size === list.length ? '선택 해제' : '전체 선택'}
                </button>
                <button type="button" disabled={busy || !sel.size} onClick={() => remove([...sel])}
                  className="h-6 px-2 text-[11px] rounded border border-[#D60051] text-[#D60051] hover:bg-[#FCEEF3] disabled:opacity-40">
                  선택삭제 ({sel.size})
                </button>
                <button type="button" disabled={busy}
                  onClick={() => { if (confirm(`박스 내 단말기 ${list.length}개를 모두 삭제할까요? (되돌리기 가능)`)) remove(list.map(t => t.id)) }}
                  className="h-6 px-2 text-[11px] rounded bg-[#D60051] text-white hover:bg-[#a51f1f] disabled:opacity-40">
                  전체삭제
                </button>
              </>
            )}
            {undo.length > 0 && (
              <button type="button" disabled={busy} onClick={restore}
                className="h-6 px-2 text-[11px] rounded border border-[#2F3941] text-[#2F3941] hover:bg-[#F6F6F7]">
                ↩ 되돌리기 ({undo.length})
              </button>
            )}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-[11px] text-[#8A949C]">불러오는 중…</div>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {list.length === 0 ? (
            <span className="text-[11px] text-[#8A949C]">등록된 단말기가 없습니다.</span>
          ) : list.map(t => {
            const on = sel.has(t.id)
            return (
              <span key={t.id}
                onClick={canEdit ? () => toggle(t.id) : undefined}
                className={`inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded border text-[10px] text-[#2F3941] ${canEdit ? 'cursor-pointer' : ''} ${on ? 'bg-[#fee2e2] border-[#D60051]' : 'bg-[#F1F1F0] border-[#E3E1DE]'}`}>
                {canEdit && <input type="checkbox" checked={on} readOnly className="w-3 h-3 pointer-events-none" />}
                <span className="font-mono">{t.trcn_id}</span>
                {t.device_type && <span className="text-[#8A949C]">{t.device_type}</span>}
                {canEdit && (
                  <button type="button" disabled={busy} onClick={e => { e.stopPropagation(); remove([t.id]) }}
                    className="px-1 rounded text-[#D60051] hover:bg-[#FCEEF3] leading-none text-[12px]">×</button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {canEdit && (
        <div className="space-y-1.5 pt-1">
          <div className="flex gap-1.5">
            <input value={device} onChange={e => setDevice(e.target.value)} placeholder="기종 (예: B700 / T600)"
              className="h-8 text-[12px] border border-[#E3E1DE] rounded px-2 bg-white w-28" />
            <textarea value={ihText} onChange={e => setIhText(e.target.value)} rows={2}
              placeholder="IH 번호 (줄바꿈/쉼표로 여러 개)"
              className="flex-1 text-[12px] border border-[#E3E1DE] rounded px-2 py-1 bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={add} disabled={busy || !ihText.trim()}
              className="h-8 px-3 text-[12px] rounded-md bg-[#111111] text-white hover:bg-[#0f172a] disabled:opacity-60">
              단말기 추가
            </button>
            {err && <span className="text-[11px] text-[#D60051]">{err}</span>}
          </div>
          <p className="text-[10px] text-[#8A949C]">택시단말기 현황에서 입·출고하면 해당 IH가 박스에서 자동 제거됩니다.</p>
        </div>
      )}
      {!canEdit && err && <span className="text-[11px] text-[#D60051]">{err}</span>}
    </div>
  )
}
