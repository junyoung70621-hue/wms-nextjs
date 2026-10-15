'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  computeStats, exportStatsExcel, bucketLabel,
  PERIOD_LABEL, TYPES, TYPE_LABEL, TYPE_COLOR,
  type HistoryRow, type Period, type Type,
} from '@/lib/historyStats'

type Filters = {
  action: string; center: string; search: string
  dateFrom: string; dateTo: string
}

function kstToday() { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10) }
function daysAgo(n: number) { return new Date(Date.now() + 9 * 3600000 - n * 86400000).toISOString().slice(0, 10) }

const INK = '#1E293B', MUTED = '#94A3B8', GRID = '#E2E8F0'

// 입출고 이력 통계 패널 — 기간별 추이 / 자재별 TOP / 센터 간 이동 / 자재×기간 표 + Excel
export default function HistoryStatsPanel({ filters }: { filters: Filters }) {
  const [period, setPeriod] = useState<Period>('month')
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [exporting, setExporting] = useState(false)

  // 기간 미지정 시 최근 1년
  const from = filters.dateFrom || daysAgo(365)
  const to = filters.dateTo || kstToday()

  useEffect(() => {
    let alive = true
    setLoading(true); setErr('')
    const params = new URLSearchParams({ limit: '5000', date_from: from, date_to: to })
    if (filters.action !== 'all') params.set('action', filters.action)
    fetch(`/api/history?${params}`)
      .then(r => r.json())
      .then(d => { if (!alive) return; if (d.error) setErr(d.error); else setRows(d.data ?? []) })
      .catch(() => alive && setErr('통계 데이터를 불러오지 못했습니다.'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [filters.action, from, to])

  // 센터·검색은 목록과 동일하게 클라이언트 필터
  const filtered = useMemo(() => {
    let r = rows
    if (filters.center !== '전체') {
      r = r.filter(h => h.from_center === filters.center || h.to_center === filters.center || h.warehouse?.location === filters.center)
    }
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase()
      r = r.filter(h => (h.warehouse?.item_name ?? '').toLowerCase().includes(q) ||
        (h.users?.name ?? '').toLowerCase().includes(q) || (h.reason ?? '').toLowerCase().includes(q))
    }
    return r
  }, [rows, filters.center, filters.search])

  const st = useMemo(() => computeStats(filtered, period), [filtered, period])

  async function download() {
    setExporting(true)
    try { await exportStatsExcel(st, period, `${from}_${to}`) } finally { setExporting(false) }
  }

  return (
    <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-[#1E293B]">📊 이동·사용 통계</span>
        <span className="text-[11px] text-[#94A3B8]">{from} ~ {to} · {filtered.length.toLocaleString()}건{rows.length >= 5000 && ' (최대 5,000건까지 집계)'}</span>
        <div className="ml-auto flex items-center gap-1">
          {(Object.keys(PERIOD_LABEL) as Period[]).map(p => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={`h-7 px-2.5 text-[11px] rounded border ${period === p ? 'bg-[#B32646] border-[#B32646] text-white' : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'}`}>
              {PERIOD_LABEL[p]}별
            </button>
          ))}
          <Button variant="outline" className="h-7 text-[11px] ml-2" disabled={loading || exporting || !filtered.length} onClick={download}>
            {exporting ? '생성 중…' : '⬇️ Excel'}
          </Button>
        </div>
      </div>

      {err && <p className="text-[12px] text-red-600">{err}</p>}
      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-10 text-center">집계 중…</div>
      ) : st.periods.length === 0 ? (
        <div className="text-[12px] text-[#94A3B8] py-10 text-center">해당 기간 이력이 없습니다.</div>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <section>
              <h4 className="text-[12px] font-semibold text-[#1E293B] mb-1">{PERIOD_LABEL[period]}별 수량 추이</h4>
              <Legend />
              <PeriodBars st={st} period={period} />
            </section>
            <section>
              <h4 className="text-[12px] font-semibold text-[#1E293B] mb-1">많이 움직인 자재 TOP 15 <span className="text-[#94A3B8] font-normal">(출고·사용 + 이동)</span></h4>
              <Legend only={['out', 'transfer']} />
              <ItemBars st={st} />
            </section>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <section className="lg:col-span-2">
              <h4 className="text-[12px] font-semibold text-[#1E293B] mb-1">자재 × {PERIOD_LABEL[period]} <span className="text-[#94A3B8] font-normal">(출고·사용 + 이동 수량, 상위 30)</span></h4>
              <PivotTable st={st} period={period} />
            </section>
            <section>
              <h4 className="text-[12px] font-semibold text-[#1E293B] mb-1">센터 간 이동</h4>
              <FlowTable st={st} />
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Legend({ only }: { only?: Type[] }) {
  return (
    <div className="flex gap-3 text-[11px] text-[#475569] mb-1">
      {(only ?? TYPES).map(t => (
        <span key={t} className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}
        </span>
      ))}
    </div>
  )
}

// 기간별 그룹 막대 (3 계열)
function PeriodBars({ st, period }: { st: ReturnType<typeof computeStats>; period: Period }) {
  const W = 560, H = 220, padL = 40, padR = 8, padT = 10, padB = 28
  const data = st.periods
  const max = Math.max(1, ...data.flatMap(p => TYPES.map(t => p.qty[t])))
  const innerW = W - padL - padR, innerH = H - padT - padB
  const groupW = innerW / data.length
  const barW = Math.max(2, Math.min(18, (groupW - 6) / TYPES.length - 2))
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const ticks = 4
  const showLabels = data.length <= 8
  const labelEvery = Math.ceil(data.length / 12)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${PERIOD_LABEL[period]}별 입고·출고·이동 수량`}>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = Math.round((max / ticks) * i)
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 4} y={y(v) + 3} fontSize={9} fill={MUTED} textAnchor="end">{v.toLocaleString()}</text>
          </g>
        )
      })}
      {data.map((p, gi) => {
        const gx = padL + gi * groupW + (groupW - (barW + 2) * TYPES.length) / 2
        return (
          <g key={p.key}>
            {TYPES.map((t, ti) => {
              const v = p.qty[t]
              const x = gx + ti * (barW + 2)
              const h = Math.max(0, padT + innerH - y(v))
              return (
                <g key={t}>
                  <rect x={x} y={y(v)} width={barW} height={h} fill={TYPE_COLOR[t]} rx={h > 4 ? 2 : 0}>
                    <title>{`${p.key} · ${TYPE_LABEL[t]}: ${v.toLocaleString()}개 (${p.cnt[t]}건)`}</title>
                  </rect>
                  {showLabels && v > 0 && (
                    <text x={x + barW / 2} y={y(v) - 3} fontSize={8} fill={INK} textAnchor="middle">{v.toLocaleString()}</text>
                  )}
                </g>
              )
            })}
            {gi % labelEvery === 0 && (
              <text x={padL + gi * groupW + groupW / 2} y={H - padB + 14} fontSize={9} fill={MUTED} textAnchor="middle">
                {bucketLabel(p.key, period)}
              </text>
            )}
          </g>
        )
      })}
      <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} stroke={MUTED} strokeWidth={1} />
    </svg>
  )
}

// 자재별 가로 누적 막대 (출고·사용 + 이동)
function ItemBars({ st }: { st: ReturnType<typeof computeStats> }) {
  const items = st.items.filter(i => i.total > 0).slice(0, 15)
  if (!items.length) return <div className="text-[11px] text-[#94A3B8] py-6 text-center">움직인 자재 없음</div>
  const rowH = 16, W = 560, labelW = 170, valW = 44, padY = 4
  const H = items.length * rowH + padY * 2
  const max = Math.max(1, ...items.map(i => i.total))
  const barMax = W - labelW - valW
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="많이 움직인 자재 TOP 15">
      {items.map((it, i) => {
        const yy = padY + i * rowH
        const wOut = (it.qty.out / max) * barMax
        const wTr = (it.qty.transfer / max) * barMax
        return (
          <g key={it.item}>
            <text x={labelW - 6} y={yy + 11} fontSize={10} fill={INK} textAnchor="end">
              {it.item.length > 20 ? it.item.slice(0, 19) + '…' : it.item}
              <title>{it.item}</title>
            </text>
            {wOut > 0 && <rect x={labelW} y={yy + 3} width={Math.max(1, wOut)} height={10} fill={TYPE_COLOR.out} rx={2}>
              <title>{`${it.item} · 출고·사용 ${it.qty.out.toLocaleString()}개`}</title></rect>}
            {wTr > 0 && <rect x={labelW + wOut + (wOut > 0 ? 2 : 0)} y={yy + 3} width={Math.max(1, wTr)} height={10} fill={TYPE_COLOR.transfer} rx={2}>
              <title>{`${it.item} · 이동 ${it.qty.transfer.toLocaleString()}개`}</title></rect>}
            <text x={labelW + wOut + wTr + 6} y={yy + 11} fontSize={10} fill={INK}>{it.total.toLocaleString()}</text>
          </g>
        )
      })}
    </svg>
  )
}

function PivotTable({ st, period }: { st: ReturnType<typeof computeStats>; period: Period }) {
  const items = st.items.filter(i => i.total > 0).slice(0, 30)
  const keys = st.periods.map(p => p.key)
  if (!items.length) return <div className="text-[11px] text-[#94A3B8] py-6 text-center">데이터 없음</div>
  return (
    <div className="overflow-auto max-h-80 rounded border border-[#E2E8F0]">
      <table className="text-[11px] border-collapse min-w-full">
        <thead className="sticky top-0 bg-[#F8F9FA]">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold text-[#64748B] border-b sticky left-0 bg-[#F8F9FA]">자재명</th>
            <th className="px-2 py-1.5 text-right font-semibold text-[#64748B] border-b">합계</th>
            {keys.map(k => <th key={k} className="px-2 py-1.5 text-right font-semibold text-[#64748B] border-b whitespace-nowrap">{bucketLabel(k, period)}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.item} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
              <td className="px-2 py-1 text-[#1E293B] whitespace-nowrap max-w-[200px] truncate sticky left-0 bg-inherit" title={it.item}>{it.item}</td>
              <td className="px-2 py-1 text-right font-mono font-bold text-[#1E293B]">{it.total.toLocaleString()}</td>
              {keys.map(k => {
                const v = it.byPeriod[k] ?? 0
                return <td key={k} className={`px-2 py-1 text-right font-mono ${v ? 'text-[#1E293B]' : 'text-[#CBD5E1]'}`}>{v ? v.toLocaleString() : '·'}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FlowTable({ st }: { st: ReturnType<typeof computeStats> }) {
  if (!st.flows.length) return <div className="text-[11px] text-[#94A3B8] py-6 text-center">센터 간 이동 없음</div>
  const max = Math.max(1, ...st.flows.map(f => f.qty))
  return (
    <div className="overflow-auto max-h-80 rounded border border-[#E2E8F0]">
      <table className="text-[11px] border-collapse w-full">
        <thead className="sticky top-0 bg-[#F8F9FA]">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold text-[#64748B] border-b">경로</th>
            <th className="px-2 py-1.5 text-right font-semibold text-[#64748B] border-b">수량</th>
            <th className="px-2 py-1.5 text-right font-semibold text-[#64748B] border-b">건수</th>
          </tr>
        </thead>
        <tbody>
          {st.flows.slice(0, 30).map((f, i) => (
            <tr key={`${f.from}→${f.to}`} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
              <td className="px-2 py-1 text-[#1E293B] whitespace-nowrap">
                <div>{f.from} <span className="text-[#94A3B8]">→</span> {f.to}</div>
                <div className="h-1 rounded bg-[#1565c0] mt-0.5" style={{ width: `${Math.max(2, (f.qty / max) * 100)}%` }} />
              </td>
              <td className="px-2 py-1 text-right font-mono text-[#1E293B]">{f.qty.toLocaleString()}</td>
              <td className="px-2 py-1 text-right font-mono text-[#64748B]">{f.cnt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
