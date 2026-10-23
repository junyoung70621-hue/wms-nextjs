export const CENTERS = [
  "자재센터", "강서센터", "강북센터",
  "강동센터", "강남센터", "택시지원파트", "리페어팀",
  "AFC지원파트", "고속/시외", "대전센터", "인천센터", "토스",
  "고객지원사업부", "에이텍본사", "티머니(버스)",
  "티머니(택시)", "외부창고",
] as const

/** 버스 센터: 버스 단말현황·Teams 알림·센터 간 이동·버스설치자재 요청 대상 */
export const BUS_CENTERS = ['강서센터', '강북센터', '강동센터', '강남센터', '인천센터']

/** 택시단말기 현황 비노출 센터 (버스 센터 + 대전센터). 관리자는 예외 */
export const NO_TAXI_TERMINAL = new Set([...BUS_CENTERS, '대전센터'])

export const NO_WAREHOUSE = new Set(['고객지원사업부'])
export const EXTERNAL = new Set(['에이텍본사', '티머니(버스)', '티머니(택시)', '외부창고'])

/** 역할별 열람 가능 센터 목록 */
export function getViewableCenters(role: string, center: string): string[] {
  const all = CENTERS.filter(c => !NO_WAREHOUSE.has(c))
  if (role === 'admin' || role === 'materials') return all
  // manager/user/guest: 본인 센터 + 자재센터 (자재요청 폼이 자재센터 재고 조회 필요)
  return all.filter(c => (c === center || c === '자재센터') && !EXTERNAL.has(c))
}
