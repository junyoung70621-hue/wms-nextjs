// 단말기장애목록 업로드 → 자동 교체
// '처리내용'(기본 AL열) 텍스트에서 "교체 (불량OLD -> 신규NEW)" IH쌍을 추출한다.
// 화살표는 ->, →, 공백, 깨진 글자(？>) 등 다양하므로 "숫자 5+자리 [짧은 구분자] 숫자 5+자리"로 잡는다.

export type FaultPair = {
  row: number      // 엑셀 행번호(1-base 표시용)
  oldIh: string    // 불량(수거) IH
  newIh: string    // 신규(설치) IH
  raw: string      // 원본 처리내용(미리보기용)
}

// 불량OLD <구분자> 신규NEW  — 구분자는 한글/영숫자가 아닌 1~4글자(화살표/공백류)
const PAIR_RE = /(\d{5,})\s*[^0-9A-Za-z가-힣]{1,4}\s*(\d{5,})/

// IH 정규화: 공백제거 + 숫자 셀(float) → 정수, 그 후 숫자만
export function normIh(raw: unknown): string {
  let s = String(raw ?? '').trim()
  if (s !== '' && Number.isFinite(Number(s))) s = String(Math.trunc(Number(s)))
  return s.replace(/\D/g, '')
}

// 처리내용 한 셀에서 교체 IH쌍 추출 (교체 건 아니면 null)
export function extractFaultPair(text: string, row: number): FaultPair | null {
  if (!text || !text.includes('교체')) return null   // 교체 건만
  const m = text.match(PAIR_RE)
  if (!m) return null                                // '맞교체'·케이블/ANT 교체 등 IH쌍 없음 → 제외
  return {
    row,
    oldIh: m[1],
    newIh: m[2],
    raw: text.replace(/[\r\n]+/g, ' / ').replace(/\s+/g, ' ').trim(),
  }
}

// 헤더 행에서 '처리내용' 컬럼 인덱스 탐색 (없으면 AL=37)
export function findContentCol(headerRow: unknown[]): number {
  const i = headerRow.findIndex(c => String(c ?? '').replace(/\s/g, '').includes('처리내용'))
  return i >= 0 ? i : 37 // AL
}
