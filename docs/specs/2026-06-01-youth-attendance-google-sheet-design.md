# 청소년부 출석부 v1.0 — Google Sheets 백엔드 설계서

- 작성일: 2026-06-01
- 작성자: 황규일 / Claude 협업
- 상태: 초안 (사용자 검토 대기)

## 1. 배경 및 목표

기존 `출석부_V0.3.html`은 모바일 우선 React SPA로 UI 완성도는 높으나 데이터를 `localStorage('hyerim_attendance_v1')`에 보관해 **기기 1대에서만 동작**한다. 14명 교사가 각자 다른 단말에서 출석을 입력·열람해야 하므로 공유 저장소가 필요하다.

본 설계의 목표:

1. **명단의 단일 출처(SSOT)**: 모든 학생 정보는 구글 시트에서만 관리. 앱에서 추가·삭제 불가.
2. **출석 데이터의 시트 저장**: 매주 출석은 시트의 `ATTENDANCE` 탭에 누적.
3. **교사 자기 반 뷰**: 로그인한 교사 본인 반의 학생만 표시·조작.
4. **인가 제어**: 시트의 화이트리스트에 등록된 구글 계정만 접근 가능.
5. **사본 → 원본 무중단 전환**: 시트 ID 한 값만 바꾸면 원본 사용 가능.

비목표(v1.0): 부장/관리자용 전체 대시보드, 부모 열람 페이지, 푸시 알림, 오프라인 동기화.

## 2. 의사 결정 요약

| # | 항목 | 결정 |
|---|---|---|
| D1 | 인증 방식 | Google ID Token + TEACHERS 시트 화이트리스트 |
| D2 | 교사 권한 | 본인 반만 자동 표시 (이메일 → 교사 이름 매핑) |
| D3 | 출석 저장 포맷 | Long format, 단일 `ATTENDANCE` 탭 |
| D4 | UI 재사용 | V0.3 React 코드 유지, 저장 계층만 GAS로 교체 |
| D5 | 기도제목 저장 | `PRAYERS` 탭에 함께 동기화 |

## 3. 아키텍처

### 3.1 컴포넌트 다이어그램

```
┌───────────────────────────┐      HTTPS (JSON)         ┌─────────────────────────┐
│ 출석부.html (V1.0)        │  ──────────────────────▶  │ Google Apps Script      │
│  - React SPA (모바일)     │   POST ?action=... + token │  (배포된 웹앱 URL)      │
│  - Google Identity        │ ◀──────────────────────  │  - IdToken 검증          │
│    Services (ID Token)    │       JSON 응답            │  - TEACHERS 화이트리스트 │
└───────────────────────────┘                            │  - 시트 R/W              │
                                                         └────────────┬─────────────┘
                                                                      │
                                              ┌───────────────────────▼───────────────┐
                                              │ Google Sheet (DB)                      │
                                              │  STUDENTS / TEACHERS                   │
                                              │  ATTENDANCE / PRAYERS                  │
                                              └────────────────────────────────────────┘
```

### 3.2 주요 설계 원칙

- 클라이언트는 시트에 직접 접근하지 않는다 (시트 권한 노출 0).
- 모든 요청은 GAS를 거치며 GAS가 신원과 권한을 강제한다.
- 클라이언트는 결정 권한이 없다. "본인 반"이라는 정보 역시 서버에서 결정되어 응답에 포함된다.
- 시트 ID는 GAS의 Script Properties 한 줄에만 존재한다.

## 4. 시트 데이터 모델

### 4.1 `STUDENTS` 탭

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | string | 영구 키 (UUID 또는 일련번호, 정렬·재배치·삭제에도 불변) |
| 반 | string | 담당 교사 이름. `TEACHERS.name` 과 일치 |
| 이름 | string | 학생 이름 |
| 성별 | enum | 남/여 |
| 연락처 | string | 학생 전화번호 |
| 생년월일 | date | ISO 8601 (YYYY-MM-DD) |
| 초등학교 | string | 출신 초등학교 (원본 시트 컬럼 보존) |
| 학교 | string | 현재 재학 중인 학교 |
| 학년 | string | 중1/중2/중3/고1/고2/고3 등 |
| 신급 | string | 입교/세례/유아세례/- 등 |
| 부/모 | string | 부모 이름 |
| 부모님연락처 | string | |
| 비고 | string | |
| 주소 | string | |
| active | bool | TRUE = 명단 표시 / FALSE = 숨김(이력 보존) |

- 첫 마이그레이션 시 기존 시트의 `2026년 청소년부 명단/번호` 를 `id` 로 채우고, 빈 칸은 새 ID 부여.
- `반` 컬럼은 교사 이름 그대로 (요구사항 부합).

### 4.2 `TEACHERS` 탭

| 컬럼 | 타입 | 설명 |
|---|---|---|
| email | string | 구글 계정 이메일 (소문자, 공백 제거 후 비교) |
| 이름 | string | `STUDENTS.반` 과 매칭되는 교사 이름 |
| role | enum | `teacher` (기본) / `admin` (v1.0에서는 동일하게 동작, 향후 확장 슬롯) |
| active | bool | FALSE 면 차단 |

- 한 교사가 여러 이메일을 쓰면 행을 여러 개로 등록 가능.

### 4.3 `ATTENDANCE` 탭 (Long format)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| 날짜 | date | 예배 날짜 (YYYY-MM-DD) |
| 학생id | string | `STUDENTS.id` |
| 학생이름 | string | 비정규화 (시트 사람 가독성용, 정정 책임 없음) |
| 반 | string | 기록 시점의 담당 교사 |
| 상태 | string | `s2`(출석)/`s3`/`s4`/`absent` 등 V0.3 코드 그대로 유지 |
| 기록자email | string | 누가 입력했는지 (감사) |
| 기록시각 | datetime | ISO 8601 |

- 유니크 키: (날짜, 학생id). 같은 키가 들어오면 UPSERT (덮어쓰기).
- 한 해 14명 × 평균 학생 12명 × 52주 ≈ 8,700행. 시트가 충분히 감당하는 규모.

### 4.4 `PRAYERS` 탭

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | string | 기도제목 ID (UUID) |
| 학생id | string | 대상 학생 |
| 반 | string | 작성 시점 교사 |
| 작성자email | string | |
| 작성시각 | datetime | |
| 수정시각 | datetime | |
| 내용 | string | |
| active | bool | FALSE = 소프트 삭제 |

## 5. 인증 흐름

### 5.1 왜 ID Token 직접 검증이 필요한가 (불변 제약)

GAS 웹앱 배포 방식과 신원 식별의 상호 작용:

- **"나(소유자)로 실행"** : 시트 권한이 교사에게 노출되지 않음(요구사항 부합). 단 `Session.getActiveUser().getEmail()` 은 방문자가 아니라 **소유자** 를 반환 → 신원 식별 불가.
- **"접속 사용자로 실행"** : 신원은 식별되나 스크립트가 교사 권한으로 동작해 시트를 읽지 못함 (시트를 교사에게 공유하면 요구사항 위반).

따라서 v1.0 은 반드시 **"나로 실행" 배포 + 클라이언트가 보낸 Google ID Token 을 GAS 가 직접 검증** 하는 구조다. ID Token 검증이 인증의 유일한 경로다.

### 5.2 검증 메커니즘

다음 둘 중 하나를 채택. 구현 단계에서 측정 후 결정:

- **(A) tokeninfo 엔드포인트 호출**: `UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=...')`. 매 호출 +100~300ms. 코드 5줄. 단순함이 장점.
- **(B) JWKS 다운로드 후 RS256 로컬 검증**: 키를 `CacheService` 에 12시간 캐시. 매 호출 +5~15ms. 코드 +50줄, 라이브러리 의존.

v1.0 권장 시작값: **(A) tokeninfo**. 응답 지연이 사용자 체감에 문제되면 (B) 로 이관.

### 5.3 흐름

1. 사용자가 앱 URL 접속.
2. "구글로 로그인" 버튼 클릭 → Google Identity Services 가 ID Token 발급 (audience = 우리 OAuth 클라이언트 ID).
3. 클라이언트가 GAS `whoami` 호출. **토큰은 헤더가 아니라 request body** 에 넣고 `Content-Type: text/plain` 으로 전송 (Section 6.1 의 CORS 회피).
4. GAS:
   - ID Token 을 위 5.2 의 방식으로 검증 (audience, 만료, 서명, iss=accounts.google.com 또는 https://accounts.google.com).
   - 이메일을 소문자로 변환하여 `TEACHERS` 에서 `active=TRUE` 인 행 조회.
   - 매칭 실패 → `{ ok:false, code:'unauthorized' }` (HTTP는 200 — GAS 가 4xx 를 못 내므로 status는 body로 전달).
   - 매칭 성공 → `{ ok:true, email, teacher, role }` 응답.
5. 클라이언트는 응답의 `teacher` 값으로 이후 모든 요청을 진행. (서버는 매 요청마다 다시 검증.)

토큰 보관:
- `sessionStorage` 에만 저장 (탭 종료 시 제거).
- 만료(기본 1시간) 시 GIS `prompt()` 로 재로그인 유도. silent refresh 시도 후 실패하면 모달.

## 6. GAS 엔드포인트

배포: `https://script.google.com/macros/s/<DEPLOY_ID>/exec`

### 6.1 호출 규약 (CORS 회피)

GAS 웹앱은 cross-origin OPTIONS preflight 를 라우팅하지 못한다. 따라서 클라이언트는:

- `fetch(GAS_URL, { method: 'POST', body: JSON.stringify({...}), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })`
- 토큰·인자 모두 body 안 JSON 에 포함. **헤더에 토큰을 넣지 않는다.**
- 쿼리스트링에도 토큰을 넣지 않는다 (GAS 실행 로그·브라우저 히스토리에 남음).

상태 코드는 항상 200 (GAS 제약). 성공/실패는 응답 body 의 `ok` 필드와 `code` 로 구분한다.

### 6.2 액션 목록

| action | 입력 | 출력 | 권한 |
|---|---|---|---|
| `whoami` | `{ idToken }` | `{ ok, email, teacher, role }` 또는 `{ ok:false, code:'unauthorized' }` | — |
| `getRoster` | `{ idToken }` | `{ ok, teacher, students:[...] }` | 본인 반 |
| `getAttendance` | `{ idToken, year }` | `{ ok, year, rows:[...] }` | 본인 반 |
| `setAttendance` | `{ idToken, date, studentId, status }` | `{ ok }` | 본인 반 학생만 |
| **`setAttendanceBatch`** | `{ idToken, date, items:[{studentId,status},...] }` | `{ ok, written }` | 본인 반 학생만 (배치) |
| `getPrayers` | `{ idToken }` | `{ ok, prayers:[...] }` | 본인 반 |
| `setPrayer` | `{ idToken, id?, studentId, text, active }` | `{ ok, id }` | 본인 반 학생만 |

### 6.3 서버 측 보호

- 모든 쓰기는 `LockService.getScriptLock()` 으로 직렬화 (UPSERT 충돌 방지).
- 로스터/교사 명단은 `CacheService` 5분 캐시.
- ATTENDANCE 의 (날짜, 학생id) 위치 인덱스를 `CacheService` 에 6시간 캐시. 매 setAttendance 때 전체 스캔을 막아 일요일 아침 동시 입력 시 응답 시간 평탄화.
- `studentId` 가 본인 반에 속하지 않으면 `{ ok:false, code:'forbidden' }`.
- `getRoster` 는 UI 가 실제로 쓰는 필드만 반환 (이름, id, 학년, 성별 정도). 주소·부모 연락처·생년월일 등 민감 PII 는 별도 `getStudentDetail(studentId)` 로 분리 (학생 상세 모달에서 필요 시만).

### 6.4 지연 목표 (현실화)

- 사용 패턴: 일요일 아침 1~2회, 평일 거의 없음.
- 단일 액션 P50 ≤ 1.0s, P95 ≤ 2.5s (GAS 웹앱 왕복 특성상 이 정도가 한계).
- 배치 액션(`setAttendanceBatch`)으로 학생별 토글 N건을 1회 호출로 합쳐 일요일 아침 부하를 줄임.

## 7. 클라이언트 변경 (V0.3 → V1.0)

### 7.0 V0.3 소스 형태와 채택 방식 (결정)

현재 프로젝트 폴더에는 `출석부_V0.3.html` (단일 HTML 37,342줄) 과 `old/출석부_V0.2.html` 만 있고 **미컴파일 JSX 소스는 없다.** 본 파일은 React 가 빌드 산출물(`React.createElement(...)` 형태)로 인라인된 상태다.

세 가지 옵션을 비교한 결과, **사용자(비개발자) 단독 유지보수 가능성** 을 가장 가중치 두어 **(다) 신규 단일파일 작성** 으로 확정한다.

| 항목 | (가) JSX 복원 | (나) 빌드 산출물 직접 수정 | **(다) 신규 단일파일 (선택)** |
|---|---|---|---|
| 필요 도구 | Node.js + npm + 빌드 도구 | 없음 | **없음** (브라우저만) |
| 소수정 워크플로 | 코드→빌드→배포 | 산출물 직접 편집 (위험) | 파일 열기→수정→저장→새로고침 |
| 파일 구성 | 소스 폴더 + 산출물 폴더 | HTML 1개 | **HTML 1개** (소스=산출물) |
| 장기 유지보수 | 빌드 환경 기억 필요 | 산출물 편집은 매우 취약 | **누구든 텍스트 편집기로 수정 가능** |
| 첫 작성 비용 | 역구성 + 빌드 셋업 | 정밀 편집(고통) | UI 재구성 (V0.3 화면이 명확해 비교적 빠름) |
| 런타임 첫 로딩 | 동일 | 동일 | 약간 느림(Babel 트랜스파일) — 주 1회 사용 패턴이라 무시 가능 |

기술 스택 (다음 둘 중 하나, 구현 단계에서 측정 후 확정):

- **React UMD + Babel Standalone (인브라우저 트랜스파일)** : V0.3 의 React 코드 형태를 거의 그대로 옮겨와 작성 가능. 익숙한 JSX.
- **Preact + htm** : 더 작고 빠름, 빌드 도구 0. 단 `htm` 문법이 JSX와 약간 다름.

UI 모양·동작은 V0.3 와 픽셀 동일하게 복제한다 (Pretendard + Montage 디자인 토큰 그대로). 컴포넌트 트리: AppBar / RosterView / PrayerView / RecordsView / StatsView / SettingsView / StudentDetail / StudentForm(읽기전용) / Modals.

### 7.1 수정 지점

V0.3 React 코드 구조를 유지하고 다음 지점만 수정한다.

| 수정 지점 | 변경 내용 |
|---|---|
| `D.defaultState()` 와 `localStorage('hyerim_attendance_v1')` 읽기/쓰기 | 제거. 대신 부팅 시 `api.whoami()` → `api.getRoster()` → `api.getAttendance(year)` 순차 호출 |
| 새 모듈 `api.js` (HTML 안에 인라인) | 위 액션의 fetch 래퍼 (text/plain+body). 응답의 `code='unauthorized'` 시 재로그인, `code='forbidden'`/`network` 등은 토스트 |
| `setModal({type:'classSwitcher'})` (반 변경) | 진입점 모두 제거 — 로그인 = 1개 반 고정 |
| `handleAddStudent` / `handleEditStudent` / `handleDeleteStudentReq` | 버튼 숨김 + 설정 화면에 "학생 명단은 시트에서 직접 편집하세요" 안내 카드 |
| `handleResetData` | 제거 |
| `handleSavePortable` / `handleImportFile` | 제거 (시트가 SSOT) |
| `setStatus` 출석 토글 | 낙관적 업데이트 → `api.setAttendance()` 호출 → 실패 시 토스트 + 롤백 |
| 기도제목 CRUD | `api.setPrayer` 호출. 작성자 = 본인 이메일 |
| AppBar 좌측 아바타 | 클릭 시 반 변경 다이얼로그가 아니라 "로그아웃" 액션 |

신규 UI:
- 로그인 게이트 화면 (구글 로그인 버튼 + 안내).
- 권한 없음 화면 (TEACHERS 등록 안 됐을 때).
- 네트워크 오류 토스트 + 재시도 버튼.

## 8. 배포 및 사본 ↔ 원본 전환

### 8.0 호스팅 위치 (확정: GitHub Pages)

**(α) 외부 호스팅 — GitHub Pages 채택.** HTML 파일을 GitHub 저장소에 푸시하면 자동으로 `https://<user>.github.io/<repo>/` 경로로 배포된다.

| 항목 | 내용 |
|---|---|
| URL 예시 | `https://kyuils.github.io/hyerim-attendance/` 또는 커스텀 도메인 |
| 비용 | 무료 |
| 배포 방식 | `git push` = 자동 배포 (1~2분) |
| HTTPS | 자동 (Let's Encrypt) |
| CORS 처리 | Section 6.1 의 text/plain + body 방식으로 우회 (이미 spec 반영) |

업로드 절차 (구현 시):
1. GitHub 에 신규 저장소 생성 (private 가능 — Pages 는 public 저장소만 무료지만 GitHub Free 계정에서도 private 저장소 Pages 지원됨, 정책 시점 확인).
2. `index.html` 한 파일 푸시.
3. 저장소 Settings → Pages → Branch=main, Folder=root 선택.
4. 1~2분 뒤 URL 활성화.
5. 추후 코드 수정 → 커밋 → 푸시 → 자동 재배포.

폴백 (PoC 단계에서 GIS 가 GitHub Pages 도메인에서 문제 발생 시): 교회 홈페이지의 정적 폴더 또는 (β) GAS HtmlService 로 이관. 가능성 낮음.

### 8.1 1회성 셋업

1. Google Cloud 콘솔에서 OAuth 2.0 Client ID 발급 (웹 애플리케이션, 승인된 출처에 호스팅 도메인).
2. 구글 시트 사본을 열고 Apps Script 프로젝트 시작.
3. GAS 프로젝트 Script Properties:
   - `SHEET_ID = <사본 시트 ID>`
   - `OAUTH_CLIENT_ID = <위에서 발급한 ID>`
4. GAS 코드 푸시 (clasp 또는 웹 IDE).
5. "배포 → 새 배포 → 웹 앱" — 액세스: 모든 사용자.
6. HTML 상단 상수에 `GAS_URL`, `OAUTH_CLIENT_ID` 채움.
7. 시트 `TEACHERS` 탭에 교사 14명 이메일·이름 등록.

### 8.2 사본 → 원본 전환

1. 원본 시트에 동일한 4개 탭(STUDENTS / TEACHERS / ATTENDANCE / PRAYERS) 생성 (헤더 동일).
2. STUDENTS 와 TEACHERS 데이터 이관.
3. GAS Script Properties `SHEET_ID` 값을 원본 ID 로 교체.
4. 코드 재배포 불필요.

## 9. 마이그레이션 (사본 시트 정리)

현재 사본은 헤더 행이 `2026년 청소년부 명단/번호`, `2025년 청소년부 명단/연락처` 등 병합 셀로 인해 1행에 다중 카테고리가 섞여 있다. 1회성 정리 스크립트 또는 수동 작업으로:

1. 새 탭 `STUDENTS` 생성, 위 4.1 의 컬럼 순서로 헤더 작성.
2. 기존 데이터 복사 후 `id`, `active` 채움. 빈 칸은 `active=TRUE`, `id` 는 새 UUID.
3. 새 탭 `TEACHERS` 생성, 교사 14명 등록.
4. 새 탭 `ATTENDANCE`, `PRAYERS` 헤더만 생성.
5. 기존 명단 탭은 보존(읽기 전용으로 유지하거나 archive\_).

## 10. 보안 및 운영 고려

- TEACHERS 시트 편집 권한은 부장(또는 본인) 한 명만.
- STUDENTS 시트 편집 권한은 부장 + 행정 담당.
- **STUDENTS 시트의 `id` 컬럼은 protected range 로 보호** (관리자가 실수로 편집·정렬해 ATTENDANCE 와의 연결이 깨지는 사고 방지).
- GAS 로그(`Logger.log`) 에 이메일과 액션만 기록, 학생 개인정보는 기록하지 않음.
- ID Token 만료 시 자동 재로그인 (사용자 클릭 없이 silent refresh 시도).
- 시트 직접 편집 시 출석 데이터가 깨질 가능성: ATTENDANCE 탭은 **사람이 손대지 말 것** 안내 (헤더 색상 + 1행 메모).
- **미성년자 PII 노출 최소화**: 명단 목록에는 이름·학년·성별·id 만 내려보내고, 상세(주소·부모 연락처·생년월일) 는 학생 상세 모달을 연 순간 별도 호출로 가져온다.

## 10.1 운영 리스크 — 교사 14명의 Google 계정 사용 여부

화이트리스트 인증의 전제는 14명 전원이 Google 계정을 일상적으로 사용한다는 것이다. 한 명이라도 안 쓰면 그 분에게는 이 시스템이 작동하지 않는다.

**현재 상태**: 14명의 Google 이메일은 추후 수집 예정 (부장 또는 본인이 운영 단계에서 수집).

**미보유자 처리 정책 (v1.0 운영 가이드)**:
- 1명 ~ 2명 미보유자가 있어도 v1.0 진행에 지장 없음.
- 해당 교사 출석은 **부장(또는 인접 교사)이 위임 입력**. TEACHERS 시트에 부장 이메일 1행, role=admin 등록 후 향후 admin 권한 확장 시 전체 반 입력 가능하도록 슬롯 준비됨.
- 추후 본인이 Google 계정을 만들면 TEACHERS 시트에 행 추가 후 본인 입력으로 전환.

## 11. 테스트 시나리오

- **T1** 등록되지 않은 이메일 로그인 → 권한 없음 화면 확인.
- **T2** 교사 A 로그인 → 본인 반 학생만 표시.
- **T3** 교사 A 가 임의로 `studentId` 를 본인 반이 아닌 값으로 보내도 403.
- **T4** 같은 (날짜, 학생) 에 두 번 입력 → 후속 입력으로 덮어쓰기.
- **T5** 네트워크 끊김 → 토스트 + 출석 토글 롤백.
- **T6** 토큰 만료 → 자동 재로그인, 작업 이어서 가능.
- **T7** 시트에서 학생 추가 → 5분 이내 또는 새로고침 시 앱에 반영.
- **T8** 시트에서 학생 `active=FALSE` → 명단에서 사라짐, 과거 출석은 보존.

## 12. 향후 확장 (v1.1+)

- 부장/관리자용 전체 반 대시보드.
- 결석자 자동 알림 (Slack/카카오톡 봇).
- 부모 열람 페이지 (학생별 출석률).
- PWA 오프라인 모드 — 캐시 후 일괄 동기화.

## 13. 결정 보류 항목 (이슈 트래커로 별도)

- **기술 스택 미세 선택**: React UMD + Babel Standalone vs Preact + htm — 구현 1차 PoC 후 확정.
- **ID Token 검증 메커니즘**: (A) tokeninfo vs (B) JWKS 로컬 — 측정 후 결정 (시작 (A)).
- **교사 14명 Google 이메일 수집**: 운영자(부장) 수집 후 TEACHERS 시트 등록. 미보유자는 위임 입력으로 처리 (Section 10.1).
- STUDENTS `id` 가 시트에 없는 경우 자동 부여 정책 (UUID vs 일련번호).
- ATTENDANCE 시트가 수년 누적되어 1만 행 초과 시 연도별 분리 시점.
- 로그인 후 1시간 이상 사용 시 silent refresh 실패 케이스 UX.

**확정된 결정 (Section 7.0, 8.0 참조)**:
- 클라이언트 작성 방식: (다) 신규 단일파일 — 빌드 도구 없음, 단일 HTML
- 호스팅 위치: (α) GitHub Pages 외부 호스팅

## 14. 변경 이력

- 2026-06-01 초안 — 인터뷰 4문항 기반.
- 2026-06-01 시니어(advisor) 검토 반영: CORS 회피(text/plain+body), ID Token 검증 메커니즘 명시, 지연 목표 현실화(<1s/P95<2.5s), 배치 출석 액션 추가, V0.3 소스 리스크 명시, 호스팅 결정 미해결로 트랙, PII 분리, id 컬럼 protected range, 교사 Google 계정 채택 리스크.
- 2026-06-01 사용자 확인 반영: V0.3 처리 방식 **(다) 신규 단일파일** 확정 (비개발자 단독 유지보수 가능성 가중), 호스팅 위치 **(α) 외부 호스팅** 확정, 교사 14명 이메일은 추후 수집 + 미보유자 위임 입력 정책 명시.
- 2026-06-01 호스팅 구체화: **GitHub Pages** 로 확정. 배포 방식·URL 형식·폴백 정책 명시.
