# 택시 단말기 현황 — Streamlit → Next.js 마이그레이션 인수인계

> 원본: `wms_v2/pages/17_taxi_dashboard.py` (1290줄)
> 목표: **UI는 새로 설계, 데이터·비즈니스 로직은 그대로 유지**

---

## 0. 데이터는 옮길 필요 없음 ⚠️

Next.js와 Streamlit이 **같은 Supabase**를 봅니다. 기존 `taxi_movements` /
`taxi_deliveries` 테이블을 그대로 쿼리하면 기존 데이터가 바로 나옵니다.
**마이그레이션·복사·백업 불필요.** 이미 동작 중인 `bus-tracking`과 동일한 방식.

따라야 할 작업: 같은 테이블을 읽고 쓰는 **lib + api + page** 계층만 새로 작성.

---

## 1. 테이블 스키마 (DB 그대로)

### `taxi_movements` — 입고/출고 이동 기록 (메인)
| 컬럼 | 타입 | 의미 |
|------|------|------|
| `id` | uuid PK | |
| `upload_id` | uuid NOT NULL | 한 번 업로드 묶음 ID (배치 삭제 단위) |
| `trcn_id` | text NOT NULL | 단말기 번호(IH). 정규화: `str(int(float(x)))` |
| `device_type` | text NOT NULL | 기종 — `T600` / `T600(지방)` / `T300` / `미분류` |
| `direction` | text NOT NULL | `'in'`(불량입고) / `'out'`(양품출고) — CHECK 제약 |
| `is_terminated` | boolean (기본 false) | 해지 단말기 여부 (입고시만 체크) |
| `is_repair_done` | boolean (기본 false) | 수리완료 → 자재센터 보관 이동 플래그 |
| `driver_name` | text NULL | 출고시 담당기사 (`조기사`/`김기사`, 추가출고는 `추가출고`) |
| `uploaded_by` | uuid → users(id) | |
| `uploaded_at` | timestamptz (now) | **상태 계산의 핵심 정렬키** |
| `upload_date` | date NOT NULL | 이동 날짜(사용자 지정) |
| `file_name` | text | |
| `notes` | text | |

### `taxi_deliveries` — 기사 배송완료 기록
| 컬럼 | 타입 | 의미 |
|------|------|------|
| `id` | uuid PK | |
| `delivery_id` | uuid NOT NULL | 배송 묶음 ID |
| `trcn_id` | text NOT NULL | 단말기 번호 |
| `device_type` | text NOT NULL | |
| `driver_name` | text NOT NULL | 배송한 기사 |
| `dealer_name` | text NULL | |
| `delivery_date` | date NOT NULL | |
| `delivered_by` | uuid → users(id) | |
| `delivered_at` | timestamptz (now) | |
| `notes` | text | |

---

## 2. 기종 분류 규칙 `classify_taxi(trcn_id)`

단말기번호를 숫자만 남긴 뒤(9자리):
- `1821`로 시작:
  - **지방(T600 지방)**: `182100001~182120260` 또는 `182136261~182140260`
  - **그 외 1821**: `T600`
- `1807`로 시작 → `T300`
- 나머지 → `미분류`

기종 표시 순서: `["T600", "T600(지방)", "T300", "미분류"]`

---

## 3. 상태 계산 로직 (가장 중요 — 그대로 이식) 🎯

상태 컬럼이 따로 없고, **trcn_id별 최신 in/out 이벤트의 `uploaded_at` 비교**로
현재 상태를 도출합니다.

```
1) 전체 in 레코드, 전체 out 레코드를 uploaded_at DESC로 가져옴
2) trcn_id별 "가장 최신 in" 1건(_latest_in), "가장 최신 out" 1건(_latest_out)만 유지
   (DESC 정렬 + 첫 등장만 채택 = setdefault)

3) 자재센터 측 재고 (in이 out보다 최신, 즉 현재 자재센터에 있음):
   for 각 trcn의 최신 in:
       최신 out이 없거나  (최신 in.uploaded_at >= 최신 out.uploaded_at):
           - is_repair_done == true  → "📦 자재센터 보관" (출고 대기)
           - is_repair_done == false → "🔧 수리중"

4) 기사 보유 재고 (out이 in보다 최신 = 현재 기사가 들고 있음):
   for 각 trcn의 최신 out:
       최신 in이 없거나  (최신 out.uploaded_at >= 최신 in.uploaded_at):
           and trcn_id가 taxi_deliveries에 없으면(아직 배송 안 됨):
               driver_name(없으면 "미배정")별로 카운트 → "🚗 물류기사 재고현황"

5) 해지 수: 전체 in 중 is_terminated == true 개수
```

### 오늘의 현황 메트릭 4종
- **🔧 수리중** = `_repair_ids` 개수 (수리완료 전)
- **📦 자재센터 보관** = `_stored_ids` 개수 (수리완료 후 출고 대기)
- **📤 양품출고 합계** = 전체 out 레코드 수
- **📥 불량입고 합계** = 전체 in 레코드 수 (해지 N대 포함)

### 기사 표시 순서
`["조기사", "김기사", "추가출고"]` 먼저 → 그 외 기사 가나다순 → `미배정` 마지막

---

## 4. 주요 액션(쓰기 동작)

| 액션 | 동작 |
|------|------|
| **업로드(입고/출고)** | 엑셀 or IH 직접입력 → 기종 자동분류 → 같은 날짜·방향 내 중복(trcn_id) 확인 → insert. 출고는 담당기사 선택, 입고는 행별 해지 체크 |
| **수리완료 처리** | 선택 단말기 in 레코드 `is_repair_done=true` 로 update (수리중 → 자재센터 보관) |
| **배송완료 처리** | 기사 보유분에서 선택 → `taxi_deliveries` insert (그러면 기사 재고에서 빠짐) |
| **추가출고** | driver_name = `"추가출고"` 로 out insert |
| **레코드 수정/삭제** | id 기준 update / `upload_id` 단위 배치 삭제 |
| **중복 확인** | `(trcn_id, upload_date, direction)` 동일하면 중복 |

탭 구성(참고, UI는 바꿔도 됨): `오늘의 현황 / 월간 현황 / 이력 조회 / 배송 이력`

---

## 5. 권한

```
_is_admin     = role == "admin"
_is_materials = center == "자재센터"
_can_write    = _is_admin or (_is_materials and role != "guest")   # 쓰기(업로드/수리완료/배송/수정/삭제)
조회           = 로그인 누구나
```

---

## 6. 따라 할 레퍼런스 — 이미 마이그레이션된 `bus-tracking`

택시는 버스 단말기와 도메인이 거의 평행합니다. **아래 3계층을 그대로 복제해서 taxi 버전으로 만드세요:**

- `src/lib/busTracking.ts`            → `src/lib/taxiTracking.ts` (DB 쿼리/타입)
- `src/app/(dashboard)/bus-tracking/` → `src/app/(dashboard)/taxi/` (페이지 UI)
- `src/app/api/bus-tracking/`         → `src/app/api/taxi/` (API 라우트)
- Supabase 클라이언트·세션은 기존 `src/lib/supabase.ts`, `src/lib/session.ts` 재사용

> bus-tracking의 인증/권한/쿼리 패턴을 먼저 읽고, 그 컨벤션을 그대로 따를 것.

---

## 7. 작업 지침 요약

1. **데이터·로직은 위 1~5장 규칙을 100% 유지** (특히 3장 상태계산은 한 글자도 바꾸지 말 것)
2. **UI/UX만 자유롭게 재설계** (Next.js + 기존 디자인 시스템)
3. 구조는 6장 bus-tracking 패턴을 미러링
4. 같은 Supabase를 쓰므로 별도 데이터 이관 없음 — 바로 기존 데이터가 보여야 정상
