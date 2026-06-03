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
  async function remove(id: string) {
    setBusy(true)
    try {
      await fetch('/api/box-terminals', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      await load(); onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="border-t border-[#E2E8F0] pt-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-bold text-[#1E293B]">📟 박스 내 단말기</span>
        <span className="text-[11px] text-[#94A3B8]">{list.length}개</span>
      </div>

      {loading ? (
        <div className="text-[11px] text-[#94A3B8]">불러오는 중…</div>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {list.length === 0 ? (
            <span className="text-[11px] text-[#94A3B8]">등록된 단말기가 없습니다.</span>
          ) : list.map(t => (
            <span key={t.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded bg-[#F1F5F9] border border-[#E2E8F0] text-[10px] text-[#475569]">
              <span className="font-mono">{t.trcn_id}</span>
              {t.device_type && <span className="text-[#94A3B8]">{t.device_type}</span>}
              {canEdit && (
                <button type="button" disabled={busy} onClick={() => remove(t.id)}
                  className="px-1 rounded text-[#c62828] hover:bg-[#fef2f2] leading-none text-[12px]">×</button>
              )}
            </span>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="space-y-1.5 pt-1">
          <div className="flex gap-1.5">
            <input value={device} onChange={e => setDevice(e.target.value)} placeholder="기종 (예: B700 / T600)"
              className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2 bg-white w-28" />
            <textarea value={ihText} onChange={e => setIhText(e.target.value)} rows={2}
              placeholder="IH 번호 (줄바꿈/쉼표로 여러 개)"
              className="flex-1 text-[12px] border border-[#E2E8F0] rounded px-2 py-1 bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={add} disabled={busy || !ihText.trim()}
              className="h-8 px-3 text-[12px] rounded-md bg-[#1E293B] text-white hover:bg-[#0f172a] disabled:opacity-60">
              단말기 추가
            </button>
            {err && <span className="text-[11px] text-[#c62828]">{err}</span>}
          </div>
          <p className="text-[10px] text-[#94A3B8]">택시단말기 현황에서 입·출고하면 해당 IH가 박스에서 자동 제거됩니다.</p>
        </div>
      )}
      {!canEdit && err && <span className="text-[11px] text-[#c62828]">{err}</span>}
    </div>
  )
}
