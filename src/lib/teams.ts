// Teams 알림 — Power Automate 워크플로(HTTP 트리거)로 Adaptive Card 전송
// 자재요청·구매요청 알림 채널 (버스단말 출고 알림은 /api/terminal/teams 의 TEAMS_WEBHOOK_URL 별도)

export type TeamsColor = 'Default' | 'Accent' | 'Good' | 'Warning' | 'Attention'
export type TeamsCell = string | number | { text: string; color?: TeamsColor; bold?: boolean }

type Card = Record<string, unknown>

function textBlock(text: string, extra: Record<string, unknown> = {}): Card {
  return { type: 'TextBlock', text: text === '' ? ' ' : text, wrap: true, ...extra }
}

function tableCell(v: TeamsCell, align: 'Left' | 'Center' | 'Right'): Card {
  const o = typeof v === 'object' ? v : { text: String(v) }
  const tb = textBlock(o.text, { size: 'Small', horizontalAlignment: align })
  if (o.bold) tb.weight = 'Bolder'
  if (o.color) tb.color = o.color
  return { type: 'TableCell', items: [tb] }
}

// 요청 알림 카드: 제목 + 요약 + 항목표(FactSet) + 품목표(Table) + 메모
export function buildRequestCard(o: {
  title: string
  subtitle?: string
  color?: TeamsColor
  facts?: [string, string][]
  tableHeaders?: string[]
  tableRows?: TeamsCell[][]
  /** 열 정렬. 기본: 첫 열 Left, 나머지 Center */
  tableAlign?: ('Left' | 'Center' | 'Right')[]
  note?: string
}): Card {
  const body: Card[] = [
    textBlock(o.title, { size: 'Large', weight: 'Bolder', color: o.color ?? 'Accent' }),
  ]
  if (o.subtitle) body.push(textBlock(o.subtitle, { size: 'Small', isSubtle: true, spacing: 'Small' }))
  if (o.facts?.length) {
    body.push({ type: 'FactSet', spacing: 'Medium', facts: o.facts.map(([title, value]) => ({ title, value: value || '-' })) })
  }
  if (o.tableHeaders?.length && o.tableRows?.length) {
    const align = (i: number) => o.tableAlign?.[i] ?? (i === 0 ? 'Left' : 'Center')
    body.push({
      type: 'Table',
      firstRowAsHeaders: true,
      showGridLines: true,
      gridStyle: 'accent',
      spacing: 'Medium',
      columns: o.tableHeaders.map((_, i) => ({ width: i === 0 ? 1 : i === 1 ? 3 : 1 })),
      rows: [
        { type: 'TableRow', style: 'accent', cells: o.tableHeaders.map((h, i) => tableCell({ text: h, bold: true }, align(i))) },
        ...o.tableRows.map(r => ({ type: 'TableRow', cells: r.map((c, i) => tableCell(c, align(i))) })),
      ],
    })
  }
  if (o.note) {
    body.push({
      type: 'Container', style: 'emphasis', spacing: 'Medium',
      items: [textBlock(o.note, { size: 'Small' })],
    })
  }
  return {
    type: 'AdaptiveCard',
    version: '1.5',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body,
  }
}

// 실패해도 요청 처리는 막지 않는다(로그만). 반환값으로 성공 여부만 알림.
// 페이로드는 Teams Workflows 웹훅 표준 형식(type=message, attachments[]) — 2026-10-26 실발송 검증
export async function sendTeamsCard(card: Card): Promise<boolean> {
  const url = process.env.TEAMS_REQUEST_WEBHOOK_URL
  if (!url) { console.warn('[teams] TEAMS_REQUEST_WEBHOOK_URL 미설정 — 알림 생략'); return false }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }],
      }),
    })
    if (!res.ok) console.warn('[teams] 전송 실패', res.status, await res.text().catch(() => ''))
    return res.ok
  } catch (e) {
    console.warn('[teams] 전송 오류', (e as Error).message)
    return false
  }
}
