import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import {
  TERMINAL_TABLE, buildCenterPivot, TEAMS_NOTIFY_CENTERS,
  type CenterPivot,
} from '@/lib/terminal'

function isJjaeOrAdmin(user: { role: string; center: string; assigned_center: string | null }) {
  const center = user.assigned_center ?? user.center
  return user.role === 'admin' || center === '자재센터'
}

function dateLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}월 ${parseInt(d, 10)}일`
}

// 센터별 출고 현황 Adaptive Card (wms_v2 _build_teams_card 포팅)
function buildTeamsCard(pivot: CenterPivot, date: string, uploadedCount: number): unknown {
  const cell = (
    text: string | number,
    opts: { bold?: boolean; align?: string; color?: string; style?: string } = {},
  ) => {
    const tb: Record<string, unknown> = {
      type: 'TextBlock',
      text: text === '' || text == null ? ' ' : String(text),
      size: 'Small',
      horizontalAlignment: opts.align ?? 'Center',
      wrap: true,
    }
    if (opts.bold) tb.weight = 'Bolder'
    if (opts.color) tb.color = opts.color
    const c: Record<string, unknown> = { type: 'TableCell', items: [tb] }
    if (opts.style) c.style = opts.style
    return c
  }

  const headerCells = [cell('종류', { bold: true, align: 'Left', color: 'Accent', style: 'accent' })]
  for (const c of pivot.centers) headerCells.push(cell(c, { bold: true, color: 'Accent', style: 'accent' }))

  const dataRows = pivot.rows.map(r => ({
    type: 'TableRow',
    cells: [
      cell(r.rowKey, { bold: true, align: 'Left', color: 'Accent' }),
      ...r.cells.map(v => cell(v > 0 ? v : '')),
    ],
  }))

  const colDefs = [{ width: 2 }, ...pivot.centers.map(() => ({ width: 1 }))]

  return {
    type: 'AdaptiveCard',
    version: '1.5',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body: [
      { type: 'TextBlock', text: '📤 센터별 출고 현황', size: 'Large', weight: 'Bolder', color: 'Accent' },
      {
        type: 'TextBlock',
        text: `${dateLabel(date)}  ·  ✅ ${uploadedCount}개 센터 업로드 완료`,
        size: 'Small', color: 'Good', spacing: 'Small',
      },
      {
        type: 'Table',
        firstRowAsHeaders: true,
        showGridLines: true,
        gridStyle: 'accent',
        horizontalCellContentAlignment: 'Center',
        columns: colDefs,
        rows: [{ type: 'TableRow', cells: headerCells }, ...dataRows],
        spacing: 'Medium',
      },
    ],
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  if (!isJjaeOrAdmin(session.user))
    return NextResponse.json({ error: '전송 권한 없음' }, { status: 403 })

  const webhookUrl = process.env.TEAMS_WEBHOOK_URL
  if (!webhookUrl)
    return NextResponse.json({ error: 'TEAMS_WEBHOOK_URL이 설정되지 않았습니다.' }, { status: 400 })

  const body = await request.json()
  const date: string = body.date
  if (!date) return NextResponse.json({ error: '날짜 누락' }, { status: 400 })

  const { data, error } = await supabase
    .from(TERMINAL_TABLE)
    .select('device_type,sub_type,from_center,to_center')
    .eq('upload_date', date)
    .eq('direction', 'out')
    .limit(10000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const pivot = buildCenterPivot(rows, 'out')
  if (!pivot) return NextResponse.json({ error: '해당 날짜 출고 데이터가 없습니다.' }, { status: 400 })

  // 알림 대상 4개 센터 중 업로드 완료된 센터 수
  const uploadedCenters = new Set(rows.map(r => r.to_center))
  const uploadedCount = TEAMS_NOTIFY_CENTERS.filter(c => uploadedCenters.has(c)).length

  const card = buildTeamsCard(pivot, date, uploadedCount)

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return NextResponse.json({ error: `Teams 전송 실패 (${res.status}) ${t}`.trim() }, { status: 502 })
    }
  } catch (e) {
    return NextResponse.json({ error: `Teams 전송 실패: ${(e as Error).message}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
