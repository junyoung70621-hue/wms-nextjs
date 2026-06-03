'use client'

// 자재창고 약도 (3D) — 자재창고_약도.xlsx 레이아웃을 그대로 이식
// 각 셀의 c/r/cs/rs 는 엑셀 병합셀 좌표에서 추출. 렉 클릭 → 해당 rack_no 상세.
import { useState } from 'react'

type Cell = { label: string; c: number; r: number; cs: number; rs: number }

// 엑셀에서 추출한 좌표 (col, row, colSpan, rowSpan)
const LAYOUT: Cell[] = [
  { label: '창고용PC', c: 7, r: 1, cs: 2, rs: 3 },
  { label: '랙18', c: 9, r: 1, cs: 4, rs: 3 }, { label: '랙19', c: 14, r: 1, cs: 5, rs: 3 },
  { label: '랙20', c: 21, r: 1, cs: 5, rs: 3 }, { label: '랙21', c: 27, r: 1, cs: 5, rs: 3 },
  { label: '기둥', c: 33, r: 1, cs: 2, rs: 4 },
  { label: '랙22', c: 36, r: 1, cs: 6, rs: 3 }, { label: '랙23', c: 43, r: 1, cs: 4, rs: 3 }, { label: '랙24', c: 48, r: 1, cs: 4, rs: 3 },
  { label: '출입구', c: 1, r: 5, cs: 2, rs: 4 },
  { label: '랙9-1', c: 27, r: 9, cs: 1, rs: 5 }, { label: '랙10-1', c: 28, r: 9, cs: 1, rs: 5 },
  { label: '랙11-1', c: 33, r: 9, cs: 1, rs: 5 }, { label: '랙12-1', c: 34, r: 9, cs: 1, rs: 5 },
  { label: '랙13-1', c: 38, r: 9, cs: 1, rs: 5 }, { label: '랙14-1', c: 39, r: 9, cs: 1, rs: 5 },
  { label: '랙15-1', c: 44, r: 9, cs: 1, rs: 5 }, { label: '랙16-1', c: 45, r: 9, cs: 1, rs: 5 },
  { label: '랙17-1', c: 50, r: 9, cs: 1, rs: 5 },
  { label: '랙1-1', c: 1, r: 13, cs: 1, rs: 5 }, { label: '랙2-1', c: 4, r: 13, cs: 1, rs: 5 },
  { label: '랙3-1', c: 9, r: 13, cs: 1, rs: 5 }, { label: '랙4-1', c: 10, r: 13, cs: 1, rs: 5 },
  { label: '랙5-1', c: 15, r: 13, cs: 1, rs: 5 }, { label: '랙6-1', c: 16, r: 13, cs: 1, rs: 5 },
  { label: '랙7-1', c: 21, r: 13, cs: 1, rs: 5 }, { label: '랙8-1', c: 22, r: 13, cs: 1, rs: 5 },
  { label: '랙9-2', c: 27, r: 15, cs: 1, rs: 6 }, { label: '랙10-2', c: 28, r: 15, cs: 1, rs: 6 },
  { label: '랙11-2', c: 33, r: 15, cs: 1, rs: 6 }, { label: '랙12-2', c: 34, r: 15, cs: 1, rs: 6 },
  { label: '랙13-2', c: 38, r: 15, cs: 1, rs: 6 }, { label: '랙14-2', c: 39, r: 15, cs: 1, rs: 6 },
  { label: '랙15-2', c: 44, r: 15, cs: 1, rs: 6 }, { label: '랙16-2', c: 45, r: 15, cs: 1, rs: 6 },
  { label: '랙17-2', c: 50, r: 15, cs: 1, rs: 6 },
  { label: '랙1-2', c: 1, r: 19, cs: 1, rs: 5 }, { label: '랙2-2', c: 4, r: 19, cs: 1, rs: 5 },
  { label: '랙3-2', c: 9, r: 19, cs: 1, rs: 5 }, { label: '랙4-2', c: 10, r: 19, cs: 1, rs: 5 },
  { label: '랙5-2', c: 15, r: 19, cs: 1, rs: 5 }, { label: '랙6-2', c: 16, r: 19, cs: 1, rs: 5 },
  { label: '랙7-2', c: 21, r: 19, cs: 1, rs: 5 }, { label: '랙8-2', c: 22, r: 19, cs: 1, rs: 5 },
  { label: '랙9-3', c: 27, r: 22, cs: 1, rs: 6 }, { label: '랙10-3', c: 28, r: 22, cs: 1, rs: 6 },
  { label: '랙11-3', c: 33, r: 22, cs: 1, rs: 6 }, { label: '랙12-3', c: 34, r: 22, cs: 1, rs: 6 },
  { label: '랙13-3', c: 38, r: 22, cs: 1, rs: 6 }, { label: '랙14-3', c: 39, r: 22, cs: 1, rs: 6 },
  { label: '랙15-3', c: 44, r: 22, cs: 1, rs: 6 }, { label: '랙16-3', c: 45, r: 22, cs: 1, rs: 6 },
  { label: '랙17-3', c: 50, r: 22, cs: 1, rs: 6 },
  { label: '랙1-3', c: 1, r: 25, cs: 1, rs: 5 }, { label: '랙2-3', c: 4, r: 25, cs: 1, rs: 5 },
  { label: '랙3-3', c: 9, r: 25, cs: 1, rs: 5 }, { label: '랙4-3', c: 10, r: 25, cs: 1, rs: 5 },
  { label: '랙5-3', c: 15, r: 25, cs: 1, rs: 5 }, { label: '랙6-3', c: 16, r: 25, cs: 1, rs: 5 },
  { label: '랙7-3', c: 21, r: 25, cs: 1, rs: 5 }, { label: '랙8-3', c: 22, r: 25, cs: 1, rs: 5 },
  { label: '랙9-4', c: 27, r: 29, cs: 1, rs: 6 }, { label: '랙10-4', c: 28, r: 29, cs: 1, rs: 6 },
  { label: '기둥', c: 32, r: 29, cs: 4, rs: 9 },
  { label: '랙13-4', c: 38, r: 29, cs: 1, rs: 6 }, { label: '랙14-4', c: 39, r: 29, cs: 1, rs: 6 },
  { label: '랙15-4', c: 44, r: 29, cs: 1, rs: 6 }, { label: '랙16-4', c: 45, r: 29, cs: 1, rs: 6 },
  { label: '랙17-4', c: 50, r: 29, cs: 1, rs: 6 },
  { label: '랙1-4', c: 1, r: 31, cs: 1, rs: 5 }, { label: '랙2-4', c: 4, r: 31, cs: 1, rs: 5 },
  { label: '기둥', c: 9, r: 31, cs: 3, rs: 5 },
  { label: '랙5-4', c: 15, r: 31, cs: 1, rs: 5 }, { label: '랙6-4', c: 16, r: 31, cs: 1, rs: 5 },
  { label: '랙7-4', c: 21, r: 31, cs: 1, rs: 5 }, { label: '랙8-4', c: 22, r: 31, cs: 1, rs: 5 },
  { label: '책상', c: 9, r: 36, cs: 3, rs: 6 },
  { label: '랙9-5', c: 27, r: 36, cs: 1, rs: 6 }, { label: '랙10-5', c: 28, r: 36, cs: 1, rs: 6 },
  { label: '랙13-5', c: 38, r: 36, cs: 1, rs: 6 }, { label: '랙14-5', c: 39, r: 36, cs: 1, rs: 6 },
  { label: '랙15-5', c: 44, r: 36, cs: 1, rs: 6 }, { label: '랙16-5', c: 45, r: 36, cs: 1, rs: 6 },
  { label: '랙17-5', c: 50, r: 36, cs: 1, rs: 6 },
  { label: '랙1-5', c: 1, r: 37, cs: 1, rs: 5 }, { label: '랙2-5', c: 4, r: 37, cs: 1, rs: 5 },
  { label: '랙5-5', c: 15, r: 37, cs: 1, rs: 5 }, { label: '랙6-5', c: 16, r: 37, cs: 1, rs: 5 },
  { label: '랙7-5', c: 21, r: 37, cs: 1, rs: 5 }, { label: '랙8-5', c: 22, r: 37, cs: 1, rs: 5 },
  { label: '랙11-12', c: 32, r: 40, cs: 4, rs: 2 },
]

// 엑셀 컬럼 너비 (fr 비율 유지) — 51열까지
const COL_FR = [11,7,7,11,7,4,6,7,11,11,7,5,8,7,11,11,7,5,8,7,11,11,7,5,6,7,11,11,7,6,5,7,11,11,7,11,7,11,11,7,6,8,7,11,11,7,8,5,7,11,5]
const MAX_ROW = 41

// 그룹 색상 (이미지 기준)
type Palette = { top: string; base: string; side: string; text: string }
const PALETTE: Record<string, Palette> = {
  orange: { top: '#F0A95E', base: '#E08A3C', side: '#B86A24', text: '#fff' },
  red:    { top: '#CC615E', base: '#B5403D', side: '#8E2E2C', text: '#fff' },
  blue:   { top: '#6BA8DC', base: '#4F8FCB', side: '#356FA6', text: '#fff' },
  green:  { top: '#7FB04E', base: '#629A38', side: '#487527', text: '#fff' },
  purple: { top: '#9579B0', base: '#7A5C99', side: '#5C4475', text: '#fff' },
}
const GROUP: Record<number, keyof typeof PALETTE> = {
  1: 'orange', 2: 'orange',
  3: 'red', 4: 'red', 5: 'red', 6: 'red', 18: 'red', 19: 'red', 20: 'red', 21: 'red',
  7: 'blue', 8: 'blue', 9: 'blue', 10: 'blue',
  11: 'green', 12: 'green', 13: 'green', 14: 'green', 22: 'green', 23: 'green', 24: 'green',
  15: 'purple', 16: 'purple', 17: 'purple',
}

function parseRack(label: string): { rackNo: string; group: number } | null {
  const m = label.match(/^랙(\d+)(?:-\w+)?$/)
  if (!m) return null
  return { rackNo: label.slice(1), group: Number(m[1]) }
}

export default function WarehouseMap({
  counts, highlight, onRackClick,
}: {
  counts: Record<string, number>           // rack_no -> 품목 수
  highlight?: Set<string>                   // 검색 매칭된 rack_no (강조)
  onRackClick: (rackNo: string, label: string) => void
}) {
  const [tilt, setTilt] = useState(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTilt(t => !t)}
          className={`h-8 px-3 text-[12px] rounded-md border transition-colors ${
            tilt ? 'bg-[#B32646] text-white border-[#B32646]' : 'bg-white text-[#475569] border-[#E2E8F0] hover:bg-[#F1F5F9]'
          }`}
        >
          {tilt ? '평면 보기' : '입체(3D) 보기'}
        </button>
        <span className="text-[11px] text-[#94A3B8]">렉을 클릭하면 선반·박스 상세가 열립니다.</span>
      </div>

      <div className="overflow-auto rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] p-6">
        <div style={{ perspective: tilt ? '1600px' : undefined }}>
          <div
            className="relative mx-auto transition-transform duration-500"
            style={{
              display: 'grid',
              gridTemplateColumns: COL_FR.map(w => `${w}fr`).join(' '),
              gridTemplateRows: `repeat(${MAX_ROW}, 13px)`,
              gap: '3px',
              minWidth: 880,
              transformStyle: 'preserve-3d',
              transform: tilt ? 'rotateX(52deg) rotateZ(0deg) scale(0.92)' : undefined,
              transformOrigin: 'center 35%',
            }}
          >
            {LAYOUT.map((cell, i) => {
              const rack = parseRack(cell.label)
              const style: React.CSSProperties = {
                gridColumn: `${cell.c} / span ${cell.cs}`,
                gridRow: `${cell.r} / span ${cell.rs}`,
              }
              if (!rack) {
                return <DecorCell key={i} label={cell.label} style={style} />
              }
              const pal = PALETTE[GROUP[rack.group] ?? 'red']
              const cnt = counts[rack.rackNo] ?? 0
              return (
                <RackCell key={i} label={cell.label} rackNo={rack.rackNo}
                  pal={pal} count={cnt} tilt={tilt} hi={!!highlight?.has(rack.rackNo)}
                  onClick={() => onRackClick(rack.rackNo, cell.label)} style={style} />
              )
            })}
          </div>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#64748B]">
        {([['orange','랙1·2'],['red','랙3~6·18~21'],['blue','랙7~10'],['green','랙11~14·22~24'],['purple','랙15~17']] as [keyof typeof PALETTE, string][]).map(([k, lbl]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: PALETTE[k].base }} />{lbl}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-[#94A3B8]">
          <span className="w-3 h-3 rounded-sm border border-[#cbd5e1] bg-white" />데이터 없음
        </span>
      </div>
    </div>
  )
}

function RackCell({ label, pal, count, tilt, hi, onClick, style }: {
  label: string; rackNo: string; pal: Palette; count: number; tilt: boolean; hi: boolean
  onClick: () => void; style: React.CSSProperties
}) {
  const has = count > 0
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} · ${count}개 품목`}
      className={`group relative rounded-[3px] text-center transition-all duration-150 hover:-translate-y-[2px] hover:z-10 focus:outline-none ${hi ? 'z-20 -translate-y-[2px]' : ''}`}
      style={{
        ...style,
        background: has ? `linear-gradient(160deg, ${pal.top}, ${pal.base})` : 'linear-gradient(160deg,#fff,#eef2f7)',
        color: has ? pal.text : '#94A3B8',
        border: hi ? '2px solid #B32646' : has ? `1px solid ${pal.side}` : '1px dashed #cbd5e1',
        // 입체감: 아래쪽 두께 + 그림자 (강조 시 딥레드 글로우)
        boxShadow: hi
          ? `0 0 0 3px rgba(179,38,70,.35), 0 4px 0 ${has ? pal.side : '#d8dee6'}, 0 7px 12px rgba(179,38,70,.4)`
          : has
            ? `0 3px 0 ${pal.side}, 0 5px 7px rgba(0,0,0,.22)`
            : '0 1px 0 #d8dee6, 0 2px 4px rgba(0,0,0,.06)',
        opacity: has || tilt || hi ? 1 : 0.92,
      }}
    >
      <span className="flex flex-col items-center justify-center h-full leading-tight px-0.5">
        <span className="text-[11px] font-bold whitespace-nowrap">{label}</span>
        {has && <span className="text-[9px] font-semibold opacity-90 mt-0.5">{count}개</span>}
      </span>
    </button>
  )
}

function DecorCell({ label, style }: { label: string; style: React.CSSProperties }) {
  const isDoor = label === '출입구'
  const isPillar = label === '기둥'
  return (
    <div
      className="flex items-center justify-center rounded-[3px] text-center"
      style={{
        ...style,
        background: isDoor ? '#1E293B' : isPillar ? 'repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 6px,#cbd5e1 6px,#cbd5e1 12px)' : '#fff',
        color: isDoor ? '#fff' : '#64748B',
        border: '1px solid #cbd5e1',
        boxShadow: '0 1px 2px rgba(0,0,0,.06)',
      }}
    >
      <span className={`text-[10px] font-semibold ${isDoor ? '[writing-mode:vertical-rl]' : ''}`}>{label}</span>
    </div>
  )
}
