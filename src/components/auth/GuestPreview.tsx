// 게스트 미리보기 — 화면 구성은 그대로 보여주고 "숫자·자재명(품명/기종/IH)"만 부분 블러
type ColType =
  | 'name' | 'ih' | 'model' | 'number'                      // ← 블러 대상
  | 'date' | 'center' | 'status' | 'text' | 'person' | 'company' | 'category' | 'location'

type Col = { label: string; type: ColType }

type Variant =
  | 'default' | 'dashboard' | 'warehouse' | 'terminal-bus' | 'terminal-taxi'
  | 'bus-tracking' | 'history' | 'usage' | 'material-requests'
  | 'purchase-requests' | 'notices' | 'inquiry'

type Config = {
  stats: { label: string; value: string }[]
  columns: Col[]
  chips: string[]
}

// 숫자·자재명 계열만 가린다
const BLUR_TYPES: ReadonlySet<ColType> = new Set(['name', 'ih', 'model', 'number'])

// 블러 뒤/옆에 채울 그럴듯한 가짜 값 (실데이터 아님)
const POOLS: Record<ColType, string[]> = {
  name:     ['버스 단말기 신형', 'RF 안테나 케이블', '거치대 브라켓', 'SAM 카드', '배선 하네스', '영수증 프린터 롤', '충전 크래들', 'GPS 모듈'],
  ih:       ['IH-30291', 'IH-28174', 'IH-31058', 'IH-29663', 'IH-30877', 'IH-27492', 'IH-31240', 'IH-28905'],
  model:    ['OBE-4500', 'TDA-2900', 'OBE-4200', 'TCX-1100', 'OBE-4500', 'TDA-2900', 'TCX-1100', 'OBE-4200'],
  number:   ['128', '46', '12', '230', '8', '64', '320', '15'],
  date:     ['2026-07-03', '2026-06-28', '2026-07-01', '2026-06-19', '2026-06-30', '2026-07-05', '2026-06-24', '2026-06-12'],
  center:   ['강남센터', '자재센터', '강서센터', '강동센터', '강북센터', '자재센터', '강남센터', '강서센터'],
  status:   ['완료', '대기중', '승인', '입고', '출고', '완료', '대기중', '승인'],
  text:     ['정기 점검 안내', '신규 입고 일정 공유', '창고 정리 공지', '시스템 사용 문의', '재고 확인 요청', '단말기 회수 안내', '월간 결산 안내', '배송 지연 안내'],
  person:   ['김*연', '이*수', '박*진', '최*아', '정*호', '한*결', '김*연', '이*수'],
  company:  ['대한운수', '서울교통', '한강운수', '수도권교통', '동서운수', '남부운수', '대한운수', '서울교통'],
  category: ['버스 설치자재', '택시 설치자재', '공용 자재', '소모품', '버스 설치자재', '택시 설치자재', '공용 자재', '소모품'],
  location: ['렉3 · 선반2 · 박스1', '렉7 · 선반1 · 박스4', '렉12 · 선반3 · 박스2', '렉5 · 선반2 · 박스3', '렉9 · 선반1 · 박스1', '렉2 · 선반4 · 박스2', '렉15 · 선반2 · 박스5', '렉8 · 선반3 · 박스1'],
}

const CONFIGS: Record<Variant, Config> = {
  default: {
    stats: [
      { label: '전체', value: '1,248' },
      { label: '이번 달 등록', value: '312' },
      { label: '이번 달 처리', value: '287' },
      { label: '처리 대기', value: '14' },
    ],
    columns: [
      { label: '항목', type: 'name' },
      { label: '분류', type: 'category' },
      { label: '센터', type: 'center' },
      { label: '수량', type: 'number' },
      { label: '상태', type: 'status' },
    ],
    chips: ['전체', '대기중', '완료'],
  },
  dashboard: {
    stats: [
      { label: '총 자재 품목', value: '428' },
      { label: '총 재고 수량', value: '12,480' },
      { label: '보유 센터', value: '9' },
      { label: '부족 재고', value: '17' },
    ],
    columns: [
      { label: '자재명', type: 'name' },
      { label: '대분류', type: 'category' },
      { label: '센터', type: 'center' },
      { label: '수량', type: 'number' },
      { label: '상태', type: 'status' },
    ],
    chips: ['전체', '버스', '택시', '공용'],
  },
  warehouse: {
    stats: [
      { label: '보유 품목', value: '312' },
      { label: '총 수량', value: '8,214' },
      { label: '이번 달 입고', value: '96' },
      { label: '이번 달 출고', value: '84' },
    ],
    columns: [
      { label: '자재명', type: 'name' },
      { label: '위치(렉·선반·박스)', type: 'location' },
      { label: '수량', type: 'number' },
      { label: '최근 입출고', type: 'date' },
      { label: '상태', type: 'status' },
    ],
    chips: ['재고', '입출고', '이동신청'],
  },
  'terminal-bus': {
    stats: [
      { label: '신규', value: '1,024' },
      { label: '불량', value: '86' },
      { label: '수리완료', value: '210' },
      { label: '이번 달 출고', value: '152' },
    ],
    columns: [
      { label: 'IH 번호', type: 'ih' },
      { label: '기종', type: 'model' },
      { label: '상태', type: 'status' },
      { label: '센터', type: 'center' },
      { label: '처리일', type: 'date' },
    ],
    chips: ['전체', '신규', '불량', '수리완료'],
  },
  'terminal-taxi': {
    stats: [
      { label: '보유', value: '764' },
      { label: '출고', value: '381' },
      { label: '수리중', value: '42' },
      { label: '이번 달 입고', value: '118' },
    ],
    columns: [
      { label: 'IH 번호', type: 'ih' },
      { label: '기종', type: 'model' },
      { label: '상태', type: 'status' },
      { label: '배송처', type: 'company' },
      { label: '일자', type: 'date' },
    ],
    chips: ['전체', '입고', '출고'],
  },
  'bus-tracking': {
    stats: [
      { label: '센터 보유', value: '246' },
      { label: '설치 운영', value: '1,893' },
      { label: '회수', value: '57' },
      { label: '이번 달 교체', value: '21' },
    ],
    columns: [
      { label: '운수사·센터', type: 'company' },
      { label: '보유', type: 'number' },
      { label: '설치', type: 'number' },
      { label: '회수', type: 'number' },
      { label: '최근 처리', type: 'date' },
    ],
    chips: ['전체', '보유', '교체'],
  },
  history: {
    stats: [
      { label: '전체 이력', value: '5,120' },
      { label: '입고', value: '2,610' },
      { label: '출고', value: '2,510' },
      { label: '오늘', value: '34' },
    ],
    columns: [
      { label: '일시', type: 'date' },
      { label: '유형', type: 'status' },
      { label: '자재명', type: 'name' },
      { label: '수량', type: 'number' },
      { label: '처리자', type: 'person' },
    ],
    chips: ['전체', '입고', '출고'],
  },
  usage: {
    stats: [
      { label: '전체 사용', value: '3,842' },
      { label: '이번 달', value: '412' },
      { label: '센터', value: '9' },
      { label: '작업자', value: '46' },
    ],
    columns: [
      { label: '사용일', type: 'date' },
      { label: '자재명', type: 'name' },
      { label: '수량', type: 'number' },
      { label: '센터', type: 'center' },
      { label: '작업자', type: 'person' },
    ],
    chips: ['전체', '이번 달'],
  },
  'material-requests': {
    stats: [
      { label: '전체 요청', value: '128' },
      { label: '대기', value: '6' },
      { label: '승인', value: '98' },
      { label: '반려', value: '24' },
    ],
    columns: [
      { label: '요청일', type: 'date' },
      { label: '품명', type: 'name' },
      { label: '수량', type: 'number' },
      { label: '요청센터', type: 'center' },
      { label: '상태', type: 'status' },
    ],
    chips: ['전체', '대기중', '승인', '반려'],
  },
  'purchase-requests': {
    stats: [
      { label: '전체 요청', value: '96' },
      { label: '대기', value: '4' },
      { label: '완료', value: '78' },
      { label: '이번 달', value: '12' },
    ],
    columns: [
      { label: '요청일', type: 'date' },
      { label: '품명', type: 'name' },
      { label: '수량', type: 'number' },
      { label: '단가', type: 'number' },
      { label: '상태', type: 'status' },
    ],
    chips: ['전체', '대기중', '완료'],
  },
  notices: {
    stats: [
      { label: '전체 공지', value: '42' },
      { label: '이번 달', value: '5' },
      { label: '필독', value: '3' },
      { label: '안읽음', value: '2' },
    ],
    columns: [
      { label: '제목', type: 'text' },
      { label: '작성자', type: 'person' },
      { label: '작성일', type: 'date' },
      { label: '조회', type: 'number' },
    ],
    chips: ['전체', '필독'],
  },
  inquiry: {
    stats: [
      { label: '전체 문의', value: '64' },
      { label: '답변 대기', value: '3' },
      { label: '답변 완료', value: '61' },
      { label: '이번 달', value: '8' },
    ],
    columns: [
      { label: '제목', type: 'text' },
      { label: '작성자', type: 'person' },
      { label: '작성일', type: 'date' },
      { label: '상태', type: 'status' },
    ],
    chips: ['전체', '답변 대기', '답변 완료'],
  },
}

export default function GuestPreview({ variant = 'default' }: { variant?: Variant }) {
  const cfg = CONFIGS[variant] ?? CONFIGS.default
  const rows = Array.from({ length: 8 }, (_, r) =>
    cfg.columns.map((col, c) => {
      const pool = POOLS[col.type]
      return { value: pool[(r + c) % pool.length], blur: BLUR_TYPES.has(col.type) }
    }),
  )

  return (
    <div className="space-y-4" aria-hidden="true">
      {/* 스탯 카드 — 라벨은 선명, 숫자만 블러 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cfg.stats.map(s => (
          <div key={s.label} className="rounded-xl border border-[#e2e8f0] bg-white p-4">
            <div className="text-[11px] font-semibold text-[#64748B]">{s.label}</div>
            <div data-guest-blur className="mt-1 text-[22px] font-extrabold text-[#1E293B]">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* 필터/탭 목업 */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-3 flex flex-wrap items-center gap-2">
        {cfg.chips.map((c, i) => (
          <span
            key={c}
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium border ${
              i === 0
                ? 'border-[#b32646] bg-[#fbe9ee] text-[#b32646] font-semibold'
                : 'border-[#e2e8f0] bg-[#f8f9ff] text-[#475569]'
            }`}
          >
            {c}
          </span>
        ))}
        <span className="ml-auto hidden sm:block w-56 rounded-md border border-[#e2e8f0] bg-white px-3 py-1.5 text-[12px] text-[#94A3B8]">
          검색어 입력
        </span>
      </div>

      {/* 테이블 — 숫자·자재명 계열 컬럼만 블러 */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[#e2e8f0] bg-[#f8f9ff]">
              {cfg.columns.map(col => (
                <th key={col.label} className="px-3 py-2.5 text-left font-semibold text-[#475569] whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b border-[#f1f5f9] last:border-0">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    {...(cell.blur ? {} : { 'data-guest-clear': true })}
                    className="px-3 py-2.5 whitespace-nowrap text-[#334155]"
                  >
                    {cell.value}
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
