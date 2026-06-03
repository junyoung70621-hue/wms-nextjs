/* 센터장 / 사용자 매뉴얼 HTML 생성 (Chrome --print-to-pdf 용) */
const fs = require('fs')
const path = require('path')
const IMG = path.join(__dirname, 'images')

function b64(file) {
  try { return 'data:image/png;base64,' + fs.readFileSync(path.join(IMG, file)).toString('base64') }
  catch { return '' }
}

// 캡처(역할별로 가장 가까운 실제 화면). 권한에 따라 버튼이 일부 다를 수 있음.
const SHOT = {
  login: 'login.png',
  dashboard_user: 'user_dashboard.png', dashboard_mgr: 'manager_dashboard.png',
  warehouse_user: 'user_warehouse.png', warehouse_mgr: 'manager_warehouse.png',
  bus: 'user_terminal_bus.png', taxi: 'admin_terminal_taxi.png',
  tracking: 'manager_bustracking.png', history: 'admin_history.png',
  usage: 'user_usage.png', matreq: 'user_material_requests.png',
  purreq: 'admin_purchase_requests.png', notices: 'admin_notices.png',
  inquiry: 'admin_inquiry.png', mypage: 'admin_mypage.png',
}

const CSS = `
* { box-sizing: border-box; }
body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; color:#1E293B; font-size:13px; line-height:1.7; margin:0; }
.page { padding:38px 44px; page-break-after: always; }
.page:last-child { page-break-after: auto; }
h1.cover-title { font-size:30px; color:#B32646; margin:0 0 6px; font-weight:800; letter-spacing:-0.5px; }
.cover { display:flex; flex-direction:column; justify-content:center; min-height:80vh; }
.cover .role { display:inline-block; background:#B32646; color:#fff; font-weight:700; padding:6px 16px; border-radius:999px; font-size:15px; margin-bottom:18px; width:fit-content; }
.cover .sub { color:#64748B; font-size:15px; margin-top:4px; }
.cover .brand { font-size:18px; font-weight:800; color:#B32646; letter-spacing:1px; }
h2.sec { font-size:20px; color:#B32646; border-bottom:3px solid #B32646; padding-bottom:8px; margin:0 0 4px; font-weight:800; }
.secnum { background:#B32646; color:#fff; border-radius:8px; padding:2px 10px; font-size:16px; margin-right:8px; }
.purpose { background:#FEF3F6; border-left:4px solid #B32646; padding:10px 14px; margin:14px 0; border-radius:0 8px 8px 0; }
.badge { display:inline-block; font-size:11px; font-weight:700; padding:2px 9px; border-radius:999px; margin-left:8px; vertical-align:middle; }
.badge.common { background:#e0f2fe; color:#0369a1; }
.badge.mgr { background:#fce4ec; color:#B32646; }
.shot { border:1px solid #cbd5e1; border-radius:10px; max-width:100%; margin:14px 0 6px; box-shadow:0 2px 8px rgba(0,0,0,.08); }
.cap { font-size:11px; color:#94A3B8; text-align:center; margin:0 0 14px; }
ol.steps { padding-left:0; counter-reset: step; list-style:none; margin:12px 0; }
ol.steps > li { position:relative; padding:8px 0 8px 42px; border-bottom:1px dashed #e2e8f0; }
ol.steps > li:before { counter-increment: step; content: counter(step); position:absolute; left:0; top:7px; width:28px; height:28px; background:#B32646; color:#fff; border-radius:50%; text-align:center; line-height:28px; font-weight:800; font-size:14px; }
ol.steps b { color:#B32646; }
.tip { background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:10px 14px; margin:12px 0; font-size:12.5px; }
.warn { background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:10px 14px; margin:12px 0; font-size:12.5px; }
.warn b, .tip b { color:#B32646; }
table.k { width:100%; border-collapse:collapse; margin:12px 0; font-size:12.5px; }
table.k th, table.k td { border:1px solid #e2e8f0; padding:7px 10px; text-align:left; }
table.k th { background:#F8F9FA; color:#475569; }
.kbd { background:#1E293B; color:#fff; border-radius:5px; padding:1px 7px; font-size:11px; font-weight:700; }
.toc li { margin:6px 0; }
.toc a { color:#1E293B; text-decoration:none; }
.muted { color:#94A3B8; }
`

// ── 페이지 정의 ────────────────────────────────────────────────────────────────
// roles: ['user','mgr'] = 둘 다, ['mgr'] = 센터장 전용
// 본문은 '극한 상세' 단계별.
function pages(role) {
  const isMgr = role === 'mgr'
  const dash = isMgr ? SHOT.dashboard_mgr : SHOT.dashboard_user
  const wh = isMgr ? SHOT.warehouse_mgr : SHOT.warehouse_user
  const P = []

  // 1. 로그인
  P.push({ t: '로그인 · 회원가입 · 비밀번호 찾기', img: SHOT.login, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 시스템에 들어가는 첫 화면입니다. 아이디/비밀번호로 로그인합니다.</div>
    <b>① 로그인 하는 법</b>
    <ol class="steps">
      <li>인터넷 주소창에 <b>amwarehouse.vercel.app</b> 을 입력하고 접속합니다. (휴대폰도 동일)</li>
      <li>가운데 <b>🔑 로그인</b> 칸에서 <b>아이디</b>를 입력합니다.</li>
      <li>그 아래 <b>비밀번호</b>를 입력합니다.</li>
      <li>다음에도 아이디가 자동으로 채워지길 원하면 <b>「아이디 저장」</b>에 체크합니다.</li>
      <li>빨간색 <b>「로그인」</b> 버튼을 누릅니다. → 대시보드 화면으로 들어갑니다.</li>
    </ol>
    <div class="tip"><b>비밀번호를 잊었어요</b> → 상단 <span class="kbd">🔓 찾기</span> 탭 → 가입 때 쓴 회사 이메일 입력 → 임시 비밀번호가 메일로 옵니다. 로그인 후 마이페이지에서 바꾸세요.</div>
    <div class="warn"><b>주의</b> — 30분 동안 아무 동작이 없으면 보안상 자동 로그아웃됩니다. 다시 로그인하면 됩니다.</div>
    <b>② 처음 쓰는 사람 (회원가입)</b>
    <ol class="steps">
      <li>상단 <span class="kbd">✏️ 회원가입</span> 탭을 누릅니다.</li>
      <li>아이디·비밀번호·이름·회사 이메일·소속 센터(<b>*</b>표시는 필수)를 입력합니다.</li>
      <li><b>「회원가입 신청」</b>을 누릅니다. → <b>관리자 승인 후</b> 로그인할 수 있습니다.</li>
    </ol>` })

  // 2. 공통 화면
  P.push({ t: '공통 화면 — 상단바 · 사이드바', img: dash, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 모든 화면에 공통으로 보이는 부분입니다. 메뉴 이동·알림·로그아웃이 여기 있습니다.</div>
    <b>① 왼쪽 사이드바 (메뉴)</b>
    <ol class="steps">
      <li>화면 <b>왼쪽</b>에 메뉴 목록이 있습니다. 항목을 누르면 그 화면으로 이동합니다.</li>
      <li>왼쪽 위 <b>☰(줄 세 개)</b> 버튼을 누르면 메뉴를 접거나 펼칠 수 있습니다.</li>
      <li><b>휴대폰</b>에서는 메뉴가 기본으로 접혀 있습니다 → <b>☰</b> 를 눌러 펼치고, 항목을 고르면 자동으로 닫힙니다.</li>
    </ol>
    <b>② 위쪽 상단바</b>
    <ul>
      <li><b>공지 N건</b> — 누르면 공지사항으로 이동합니다.</li>
      <li><b>처리대기 (이동·자재·구매)</b> — 처리할 건수입니다. 누르면 해당 <b>대기중</b> 목록으로 바로 갑니다. <span class="muted">(PC 화면에서 보임)</span></li>
      <li><b>오른쪽 끝</b> — <span class="kbd">⚙ 마이페이지</span> · <span class="kbd">Logout</span> 버튼.</li>
    </ul>
    <div class="tip"><b>휴대폰 앱처럼 쓰기</b> — 안드로이드는 크롬 ⋮ → 「앱 설치/홈 화면에 추가」, 아이폰은 사파리 공유 → 「홈 화면에 추가」. 자세한 건 공지사항 참고.</div>` })

  // 3. 대시보드
  P.push({ t: '대시보드 — 자재현황(전체)', img: dash, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 로그인하면 처음 보이는 요약 화면입니다. 전체 현황을 한눈에 봅니다. <b>보기 전용</b>(수정 없음).</div>
    <b>화면에서 보는 것</b>
    <ol class="steps">
      <li>위쪽 <b>통계 카드</b> — 전체 품목 수, 재고 없음 수 등 요약 숫자입니다.</li>
      <li><b>센터별 재고 / 최근 이력</b> — 최근 입·출고 움직임을 봅니다.</li>
      <li><b>재고 없음 알림</b> — 수량이 0인 품목을 빨간색으로 알려줍니다.</li>
    </ol>
    <div class="tip">여기서는 <b>누르거나 입력할 게 없습니다.</b> 현황 확인용입니다. 실제 작업은 왼쪽 메뉴에서 합니다.</div>` })

  // 4. 재고 현황
  P.push({ t: '재고 현황', img: wh, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 자재 재고를 조회하고, 다른 센터로 <b>이동 신청</b>하거나 <b>사용내역(재고 차감)</b>을 입력합니다.</div>
    <b>① 재고 조회·검색</b>
    <ol class="steps">
      <li>맨 위 <b>센터 선택</b>에서 볼 센터를 고릅니다. <span class="muted">(기본은 본인 센터)</span></li>
      <li><b>검색창</b>에 자재명·분류를 입력하면 바로 걸러집니다.</li>
      <li><b>대분류 / 중분류 / 소분류</b> 드롭다운으로 좁혀서 봅니다.</li>
      <li>표에서 자재를 <b>클릭</b>하면 상세 창이 열립니다 (이력·이동신청 탭).</li>
    </ol>
    ${isMgr ? `<b>② 이동 신청 받기 (승인)</b> <span class="badge mgr">센터장</span>
    <ol class="steps">
      <li>상단 <b>「🚚 이동 신청 현황」</b> 탭을 누릅니다.</li>
      <li><b>대기중</b> 목록에서 <b>본인 센터로 들어오는</b> 이동 신청을 확인합니다.</li>
      <li>맞으면 <b>「승인」</b>, 아니면 <b>「거절」</b> 을 누릅니다. → 승인하면 재고가 본인 센터로 넘어옵니다.</li>
    </ol>` : ''}
    <b>${isMgr ? '③' : '②'} 자재 이동 신청 하기</b>
    <ol class="steps">
      <li>재고 목록에서 보낼 자재를 <b>클릭</b> → 상세 창에서 <b>「🚚 이동 신청」</b> 탭.</li>
      <li><b>도착 센터</b>와 <b>수량</b>을 입력합니다. (출발 센터는 본인 센터로 자동 고정)</li>
      <li><b>「🚚 이동 신청」</b> 버튼을 누릅니다. → 도착 센터 책임자가 승인하면 완료됩니다.</li>
    </ol>
    <div class="warn"><b>주의</b> — <b>입고/출고(직접 수량 변경)</b>는 자재센터·관리자만 가능합니다. 센터에서는 <b>이동 신청</b>과 <b>사용내역</b>으로 처리합니다.</div>` })

  // 5. 버스단말기 현황
  P.push({ t: '버스단말기 현황', img: SHOT.bus, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 버스 단말기(티머니) 입·출고 현황과 기종별 수량을 봅니다.</div>
    <ol class="steps">
      <li>왼쪽 메뉴 <b>「버스단말기 현황」</b>을 누릅니다.</li>
      <li>상단 탭으로 <b>오늘의 현황 / 월간 / 이력</b> 등을 전환합니다.</li>
      <li><b>기종별 표</b>와 <b>센터별 출·입고 표</b>로 수량을 확인합니다.</li>
    </ol>
    <div class="tip">엑셀 업로드(출고/입고 등록)는 <b>자재센터·관리자</b> 권한에서만 보입니다. 센터는 <b>조회</b> 중심입니다.</div>` })

  // 6. 택시단말기 현황
  P.push({ t: '택시단말기 현황', img: SHOT.taxi, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 택시 단말기 수리/보관/기사 재고와 월간 현황을 봅니다.</div>
    <ol class="steps">
      <li>왼쪽 메뉴 <b>「택시단말기 현황」</b>을 누릅니다.</li>
      <li>탭: <b>📊 현황 / 📅 월간 현황 / 📋 이력 조회 / 🚚 배송 이력</b>.</li>
      <li><b>표 머리글(예: TRCN_ID·기종·입고일)</b>을 누르면 <b>오름/내림차순 정렬</b>됩니다(▲▼).</li>
      <li><b>📅 월간 현황</b>에서 달을 고르면 그 달 출고·입고·순증감과 기종별/일자별 표가 나옵니다.</li>
    </ol>` })

  // 7. 센터 단말현황(버스)
  P.push({ t: '센터 단말현황 (버스)', img: SHOT.tracking, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 우리 센터가 보유한 버스 단말기를 <b>직원별로 배정/교체/반납</b> 관리합니다. <span class="muted">(강서·강북·강동·강남 센터에서 보임)</span></div>
    <b>① 배정 현황 보기</b>
    <ol class="steps">
      <li>왼쪽 메뉴 <b>「센터 단말현황(버스)」</b> → <b>📋 배정 현황</b> 탭.</li>
      <li>직원별로 어떤 단말기(IH)를 보유 중인지 확인합니다.</li>
    </ol>
    <b>② 직원에게 단말기 배정 / 불량 교체 / 반납</b>
    <ol class="steps">
      <li>직원을 고르고 <b>새 배정</b>으로 단말기를 배정합니다.</li>
      <li>불량이 나면 <b>「🔄 불량 교체」</b> → 수거한 불량 IH를 입력해 교체 처리합니다.</li>
      <li>센터로 돌려보낼 땐 <b>「반납」</b> 처리합니다.</li>
    </ol>
    ${isMgr ? `<b>③ 초기 등록 / 장애목록 자동교체</b> <span class="badge mgr">센터장</span>
    <ol class="steps">
      <li><b>📤 초기 등록</b> 탭 — 엑셀(직원명·IH)로 보유 현황을 한 번에 등록합니다. <span class="warn" style="display:inline; padding:2px 8px;">「완전초기화」 체크 시 그 센터 기존 데이터가 모두 지워지고 새로 채워집니다(변경이력은 보존).</span></li>
      <li><b>🔄 장애목록 자동교체</b> 탭 — 단말기장애목록 엑셀을 올리면 「교체(불량→신규)」를 자동 추출해, 미리보기 확인 후 일괄 교체합니다.</li>
    </ol>` : '<div class="tip">초기 등록·자동교체 같은 일괄 작업은 센터장·관리자 권한에서 보입니다.</div>'}` })

  // 8. 입출고 이력
  P.push({ t: '입출고 이력', img: SHOT.history, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 자재의 입고·출고·이동 기록을 날짜로 조회합니다.</div>
    <ol class="steps">
      <li>왼쪽 메뉴 <b>「입출고 이력」</b>.</li>
      <li>위쪽 <b>날짜 범위 / 센터 / 유형</b>을 골라 <b>조회</b>합니다.</li>
      <li>필요하면 <b>「엑셀」</b> 버튼으로 내려받습니다.</li>
    </ol>` })

  // 9. 사용내역
  P.push({ t: '사용내역 (재고 차감)', img: SHOT.usage, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 현장에서 사용한 자재를 등록하면 재고가 <b>자동으로 차감</b>됩니다.</div>
    <ol class="steps">
      <li>왼쪽 메뉴 <b>「사용내역 이력」</b>.</li>
      <li>날짜 범위로 과거 사용내역을 <b>조회</b>합니다.</li>
      <li>사용내역 등록(CSV 업로드 등)으로 사용분을 올리면 본인 센터 재고에서 빠집니다.</li>
    </ol>
    <div class="tip">출고(사용) 전용 화면입니다. 잘못 올렸으면 관리자에게 문의하세요.</div>` })

  // 10. 자재요청 (핵심)
  P.push({ t: '자재요청', img: SHOT.matreq, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 부족한 자재를 <b>자재센터에 요청</b>합니다. (센터의 핵심 기능)</div>
    <b>① 새 자재요청 하기</b>
    <ol class="steps">
      <li>왼쪽 메뉴 <b>「자재요청현황」</b> → <b>「➕ 새 요청」</b> 탭.</li>
      <li>필요한 자재를 검색해 고르고 <b>요청 수량</b>을 입력합니다. (여러 개 가능)</li>
      <li>필요하면 <b>비고</b>를 적습니다.</li>
      <li><b>제출</b>합니다. → 관리자·자재파트에게 알림이 갑니다.</li>
    </ol>
    <b>② 내 요청 진행 보기</b>
    <ol class="steps">
      <li>탭에서 <b>전체 / 대기중 / 승인 / 거절 / 보류</b>로 상태를 확인합니다.</li>
      <li>승인·거절되면 <b>알림(푸시·메일)</b>으로 결과가 옵니다.</li>
    </ol>
    ${isMgr ? '<div class="tip"><b>센터장 참고</b> — 자재요청의 <b>승인 처리</b>는 자재파트·관리자가 합니다. 센터장도 요청은 동일하게 합니다.</div>' : ''}` })

  // 11. 구매요청 (핵심, 네이버 검색)
  P.push({ t: '구매요청 (네이버 검색)', img: SHOT.purreq, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 외부에서 <b>구매가 필요한 물품</b>을 요청합니다. 네이버 쇼핑 검색으로 품명·링크를 자동 입력할 수 있습니다.</div>
    <b>① 새 구매요청 하기</b>
    <ol class="steps">
      <li>왼쪽 메뉴 <b>「구매 요청」</b> → <b>「📝 새 요청 작성」</b> 탭.</li>
      <li><b>구매 목록</b> 표에서 품명 옆 <b>🔍 버튼</b>을 누릅니다.</li>
      <li>검색창에 상품명을 입력하고 <b>검색</b> → 결과에서 맞는 상품을 <b>클릭</b>하면 <b>품명·링크가 자동 입력</b>됩니다.</li>
      <li><b>수량</b>을 입력하고, 줄이 더 필요하면 <b>「+ 행 추가」</b>.</li>
      <li><b>구매사유 *</b>, <b>원가반영 *</b>을 입력합니다. (필수)</li>
      <li><b>「📨 요청 제출」</b>을 누릅니다. → 관리자·자재파트에게 알림이 갑니다.</li>
    </ol>
    <b>② 내 요청 / 진행 보기</b>
    <ol class="steps">
      <li><b>「👤 내 요청」</b> 탭에서 진행 상태(대기중/처리중/완료/거절)를 봅니다.</li>
    </ol>
    <div class="tip"><b>휴대폰</b>에서는 구매 목록 표를 <b>좌우로 밀어</b> 입력칸을 봅니다. 탭은 한 줄로 좌우 스크롤됩니다.</div>` })

  // 12. 공지 / 문의 / 마이페이지
  P.push({ t: '공지사항 · 문의하기 · 마이페이지', img: SHOT.notices, html: `
    <div class="purpose"><b>이 페이지의 목적</b> — 공지 확인, 1:1 문의, 내 정보·비밀번호 관리.</div>
    <b>① 공지사항</b>
    <ol class="steps">
      <li>왼쪽 메뉴 <b>「공지사항」</b> 또는 상단 <b>공지 N건</b>을 누릅니다.</li>
      <li>공지를 눌러 내용을 읽습니다. (읽으면 읽음 처리)</li>
    </ol>
    <b>② 문의하기</b>
    <ol class="steps">
      <li>왼쪽 메뉴 <b>「문의하기」</b> → 제목·내용 작성 후 제출.</li>
      <li>관리자가 답변하면 <b>메일</b>로 알려줍니다.</li>
    </ol>
    <b>③ 마이페이지</b>
    <ol class="steps">
      <li>오른쪽 위 <b>⚙ 마이페이지</b>.</li>
      <li>이름·연락처 등 <b>내 정보 수정</b>, <b>비밀번호 변경</b>을 합니다.</li>
    </ol>
    <div class="tip"><b>푸시 알림 켜기</b> — 화면 위에 <b>「🔔 알림 켜기」</b> 띠가 보이면 눌러서 허용하세요. 새 공지·요청 결과 등을 휴대폰 알림으로 받습니다.</div>` })

  return P
}

function buildHtml(role) {
  const roleLabel = role === 'mgr' ? '센터장(센터 책임자)' : '사용자(센터 직원)'
  const ps = pages(role)
  const cover = `
  <div class="page cover">
    <div class="brand">ATEC · 에이텍모빌리티</div>
    <h1 class="cover-title">자재관리 시스템 사용 매뉴얼</h1>
    <div class="role">${roleLabel} 용</div>
    <div class="sub">화면 캡처와 함께 보는 단계별 사용 설명서</div>
    <div class="sub muted" style="margin-top:24px;">amwarehouse.vercel.app · 시범운영</div>
    <div class="sub muted">※ 화면은 데이터·권한·기기에 따라 조금씩 다르게 보일 수 있습니다.</div>
  </div>`
  const toc = `
  <div class="page">
    <h2 class="sec">목차</h2>
    <ol class="toc">${ps.map((p, i) => `<li>${i + 1}. ${p.t}</li>`).join('')}</ol>
  </div>`
  const body = ps.map((p, i) => `
  <div class="page">
    <h2 class="sec"><span class="secnum">${i + 1}</span>${p.t}</h2>
    ${p.img ? `<img class="shot" src="${b64(p.img)}"/><div class="cap">▲ ${p.t} 화면 예시</div>` : ''}
    ${p.html}
  </div>`).join('')
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${cover}${toc}${body}</body></html>`
}

for (const role of ['user', 'mgr']) {
  const out = path.join(__dirname, role === 'mgr' ? '센터장_매뉴얼.html' : '사용자_매뉴얼.html')
  fs.writeFileSync(out, buildHtml(role), 'utf8')
  console.log('생성:', out)
}
