# 수리센터(atec-repair) → WMS 연동

수리완료 단말기를 사내 WMS 자재센터 재고로 자동 귀속시키는 연동.

- **흐름:** 수리센터 "수리완료 등록" → WMS 웹훅 호출 → 택시는 `taxi_movements`(보관), 버스는 `terminal_movements`(자재센터 귀속) → 타센터 출고는 기존 기능 사용
- **WMS 수신부: 구현 완료** (`POST /api/integrations/repair-inbound`)
- **수리센터 측: 아래 프롬프트로 작업** (outbound 호출 한 줄 추가)

---

## 0) WMS 운영 배포 전 — 환경변수 설정 (이미 발급된 키)

WMS의 **Vercel 프로젝트 → Settings → Environment Variables**에 추가 후 재배포:

```
REPAIR_INTEGRATION_KEY = repair_00c5c2ca09c5a1d9ba4f417997c74be69d7e83a6b635c2a6
```

> 로컬 `.env.local`에는 이미 추가되어 있음. 키가 없으면 엔드포인트가 503을 반환함.

**연동 정보 (수리센터에 전달할 값):**

| 항목 | 값 |
|------|-----|
| URL | `https://<WMS-운영-도메인>/api/integrations/repair-inbound` |
| 헤더 | `x-api-key: repair_00c5c2ca09c5a1d9ba4f417997c74be69d7e83a6b635c2a6` |

`<WMS-운영-도메인>`은 WMS가 배포된 실제 도메인으로 바꿔서 전달하세요.

---

## 1) 수리센터(atec-repair) Claude에 붙여넣을 프롬프트

아래 블록을 그대로 복사해서 atec-repair 프로젝트의 Claude에 붙여넣으세요.
(URL의 `<WMS-운영-도메인>`만 실제 값으로 바꾸면 됩니다. 키는 이미 채워져 있음)

```
우리 앱(atec-repair, 단말기 수리이력 관리)에 외부 연동 기능을 추가해줘.

## 목적
"수리완료 등록"이 성공하면, 그 단말기를 사내 WMS(자재관리 시스템)의
자재센터 재고로 자동 귀속시키기 위해 WMS 쪽 웹훅을 호출해야 한다.
즉, 우리 쪽 등록이 DB에 정상 저장된 직후 → WMS로 POST 한 번 쏘는 것.

## 호출 계약 (WMS 팀이 확정한 스펙, 변경 금지)
- 메서드/URL:  POST https://<WMS-운영-도메인>/api/integrations/repair-inbound
- 헤더:        x-api-key: repair_00c5c2ca09c5a1d9ba4f417997c74be69d7e83a6b635c2a6
               Content-Type: application/json
- 바디(JSON):
  {
    "sn": "182100123",        // 단말기 S/N (= IH). 우리가 저장하는 S/N 값 그대로
    "category": "택시",        // 우리 '구분' 값 그대로 ("택시" | "버스" | "외부기관" 등)
    "repair_date": "2026-06-08", // 수리일 (YYYY-MM-DD)
    "worker": "홍길동",         // 담당자 (없으면 null 가능)
    "is_ndf": false,           // NDF 여부 (true면 WMS가 알아서 제외함)
    "source_id": "우리쪽_수리기록_고유ID" // 우리 DB의 해당 수리 레코드 PK (멱등/추적용)
  }
- 응답: 200이면 성공. 본문 예: {"ok":true,"summary":{"received":1,"stored":1,"skipped":0}, ...}
  WMS가 기종분류/중복제거/제외(NDF·외부기관)를 모두 알아서 처리하므로,
  우리는 "수리완료된 건 전부 그대로" 보내면 된다. 우리 쪽에서 필터링하지 말 것.
- 여러 건을 한 번에 보낼 수도 있다: 바디를 배열 [ {...}, {...} ] 로 보내면 일괄 처리됨.

## 발화 시점
- 수리 기록이 "수리완료" 상태로 정상 저장(insert/commit)된 직후 1회.
- 엑셀 임포트 등으로 여러 건이 한 번에 완료되면, 배열로 한 번에 보내거나 건별로 각각 POST.
- 이미 등록된 건을 수정만 하는 경우엔 보내지 않아도 된다(WMS가 중복은 걸러내지만,
  불필요한 호출은 줄이는 게 좋음).

## 안전/장애 처리 (중요)
- 이 호출은 fire-and-forget 로 처리해서, WMS 호출이 실패하거나 느려도
  우리 앱의 수리완료 등록 자체는 절대 막히면 안 된다 (try/catch로 감싸고 await 실패 무시).
- 실패 시 콘솔/서버 로그에 sn·source_id·에러를 남길 것.
- 가능하면 실패 건을 나중에 재전송할 수 있도록 간단한 재시도/큐(예: 실패 로그 테이블 또는
  status 컬럼)를 두면 좋지만, 1차 구현은 fire-and-forget + 로깅으로 충분.
- URL과 키는 코드에 하드코딩하지 말고 환경변수(WMS_REPAIR_INBOUND_URL, WMS_REPAIR_API_KEY)로.

## 정리
"수리완료 등록 핸들러 끝에서 위 계약대로 WMS에 POST를 보내는 것"이 전부다.
분류/중복/제외 로직은 WMS가 담당하니 우리 쪽은 단순 전달만 한다.
```

---

## 2) 연동 동작 확인 (수리센터 작업 전, WMS 단독 테스트)

WMS 배포 후 아래 curl로 수신부가 사는지 바로 확인 가능 (PowerShell):

```powershell
curl.exe -X POST "https://<WMS-운영-도메인>/api/integrations/repair-inbound" `
  -H "x-api-key: repair_00c5c2ca09c5a1d9ba4f417997c74be69d7e83a6b635c2a6" `
  -H "Content-Type: application/json" `
  -d '{\"sn\":\"182100123\",\"category\":\"택시\",\"repair_date\":\"2026-06-08\",\"worker\":\"테스트\",\"is_ndf\":false,\"source_id\":\"test-1\"}'
```

성공 시 `{"ok":true,"summary":{"received":1,"stored":1,"skipped":0},...}` 가 오고,
`/terminal/taxi`의 "📦 보관"에 해당 S/N이 잡힙니다. (테스트 건은 이력에서 삭제 가능)

---

## WMS 측 동작 요약 (참고)

`POST /api/integrations/repair-inbound` 가 받는 즉시:

1. `x-api-key` 검증 (불일치 401, 키 미설정 503)
2. `is_ndf=true` 또는 `category`가 택시/버스가 아니면 → **제외**(skipped)
3. S/N 기종 분류
   - **택시** → `taxi_movements` 에 `direction=in, is_repair_done=true` 로 insert → 즉시 "📦 자재센터 보관" → **양품출고로 바로 출고 가능**
   - **버스** → `terminal_movements` 에 `from=리페어팀, to=자재센터, direction=in, file_name='수리센터연동'` 으로 insert → `/terminal/bus` **"📦 수리완료 출고대기"** 탭에 나타남 → 선택해 도착센터로 출고하면 해당 센터 보유현황에 자동 등록 + 푸시 (기존 출고 인프라 재사용)
4. 멱등: 같은 (S/N, 수리일, 입고) 이 이미 있으면 중복(skipped)
5. 귀속 성공 시 자재센터·admin에게 웹푸시 알림

## 버스 출고대기 풀 (구현 완료)

`/terminal/bus` → **"📦 수리완료 출고대기"** 탭:
- 자재센터에 귀속된 버스 수리완료 단말기 목록 (아직 출고 안 된 것만)
- 체크 → 도착센터·날짜 선택 → "선택 N건 출고" → 도착센터 보유현황 자동 등록(`stockToCenter`) + 푸시
- 출고하면 풀에서 자동으로 빠짐. 권한: 출고는 admin/자재센터(`canUpOut`), 조회는 전체
- 조회 API: `GET /api/terminal/repair-pool`

## 남은 단계

- [ ] WMS 운영 환경변수 `REPAIR_INTEGRATION_KEY` 설정 + 재배포
- [ ] 위 프롬프트로 수리센터(atec-repair) outbound 호출 추가
