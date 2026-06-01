export const CENTERS = [
  "자재센터", "강서센터", "강북센터",
  "강동센터", "강남센터", "택시지원파트", "리페어팀",
  "AFC지원파트", "고속/시외", "대전센터", "토스",
  "고객지원사업부", "에이텍본사", "티머니(버스)",
  "티머니(택시)", "외부창고",
] as const

export const NO_WAREHOUSE = new Set(['고객지원사업부'])
export const EXTERNAL = new Set(['에이텍본사', '티머니(버스)', '티머니(택시)', '외부창고'])

/** 역할별 열람 가능 센터 목록 */
export function getViewableCenters(role: string, center: string): string[] {
  const all = CENTERS.filter(c => !NO_WAREHOUSE.has(c))
  if (role === 'admin' || role === 'materials') return all
  if (role === 'manager' || role === 'user') {
    return all.filter(c => c === center && !EXTERNAL.has(c))
  }
  // guest
  return all.filter(c => !EXTERNAL.has(c))
}
