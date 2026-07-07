// 둘러보기(게스트) 모드 전용 기능 안내 — 버튼 아래에서 위를 가리키는 손그림 화살표 + 빨간 라벨
// .guest-veil 안에서만 표시됨(globals.css). 0폭 앵커 + 절대배치라 레이아웃에 영향 없음.
// side="left": 오른쪽 패널/우측 끝 버튼용 — 라벨이 왼쪽 아래로 뻗고 화살표(↗)가 오른쪽에서 위를 가리킴
// long: 주변 글자와 겹칠 때 화살표를 더 길게 빼서 라벨을 멀리 배치
export default function GuestCallout({
  label,
  long = false,
  side = 'right',
}: {
  label: string
  long?: boolean
  side?: 'left' | 'right'
}) {
  const arrow = (
    <svg viewBox="0 0 32 32" fill="none">
      <path
        d="M28 27 C 19 25, 10 18, 6.5 7.5"
        stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none"
      />
      <path
        d="M2.5 13 L6.2 6.2 L13 9"
        stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
    </svg>
  )
  return (
    <span className="guest-callout" aria-hidden="true">
      <span className={`guest-callout-inner${long ? ' long' : ''}${side === 'left' ? ' side-left' : ''}`}>
        {side === 'left' ? (
          <>
            <span>{label}</span>
            {arrow}
          </>
        ) : (
          <>
            {arrow}
            <span>{label}</span>
          </>
        )}
      </span>
    </span>
  )
}
