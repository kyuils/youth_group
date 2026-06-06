# 운영자(부장) 인수인계

## 일상 운영

| 상황 | 작업 |
|---|---|
| 학생 추가 | **`2026 반편성` 시트**에 행 추가. A컬럼(번호)에 새 번호 부여 (절대 재사용 금지), P컬럼에 담당 교사 이름. STUDENTS 탭은 자동으로 갱신됨 (수식 매핑). |
| 학생 제외 (이력 보존) | `2026 반편성` 시트에서 행을 두고 출석만 안 체크. 또는 Q열에 활성 컬럼 추가 후 STUDENTS 수식 갱신 (고급) |
| 학생 반 변경 | `2026 반편성` 시트의 P컬럼 (교사명) 수정. 5분 후 또는 캐시 무효화 후 반영 |
| 교사 추가 | TEACHERS 시트에 행 추가 (email, 이름, role, active). 시트 기본 active=TRUE |
| 교사 이메일 변경 | TEACHERS 시트의 email 컬럼 수정 |
| 출석 잘못 입력됨 | 앱에서 다시 토글 (UPSERT — 행 추가 없이 덮어쓰기). 또는 ATTENDANCE 시트 해당 행 직접 수정 |
| 모든 캐시 즉시 비우기 | Apps Script IDE → 함수 `invalidateCache_` 선택 → 실행 |

## 새 교사가 처음 로그인할 때 안내사항

OAuth 앱이 미검증(unverified) 상태라서 첫 로그인 시 경고 화면이 나옵니다. 정상이고 안전합니다.

> 1. "구글 로그인으로 로그인" 클릭
> 2. 본인 Gmail 계정 선택
> 3. **"Google에서 확인하지 않은 앱"** 경고 화면 →
>    - **"고급"** 클릭
>    - **"혜림교회 청소년부 출석부(안전하지 않음)(으)로 이동"** 클릭
> 4. 권한 허용
> 5. 본인 반 학생 명단 표시됨

이 경고는 부장(앱 소유자)이 만든 내부 앱이라서 뜨는 것입니다. 본인이 직접 OAuth 검증을 신청하지 않은 모든 개인 앱에 동일하게 나타납니다.

## 문제 해결

| 증상 | 점검 |
|---|---|
| 등록된 교사인데 "접근 권한이 없어요" 화면 | TEACHERS 시트의 email 컬럼이 정확한지(공백·대소문자) + `active=TRUE`. 캐시 5분 대기 또는 `invalidateCache_()` 실행 |
| 명단에 새 학생이 안 보임 | `2026 반편성` 시트 A컬럼(번호)이 채워졌는지, P컬럼(교사명)이 정확한지 확인. 캐시 5분 대기 또는 `invalidateCache_()` 실행 |
| 출석이 시트에 안 들어감 | Apps Script IDE → 실행 로그에서 에러 확인. 가장 흔한 원인: 토큰 만료 (1시간) → 다시 로그인 |
| 전체 동작 점검 | [E2E 체크리스트](06-test-checklist.md) 다시 실행 |
| **"명단 불러오기 실패" 토스트 (server_error)** | 캐시가 100KB를 넘었을 가능성. 학생 수가 매우 많거나 PII가 길 때 발생. `invalidateCache_()` 실행 후 다시 시도 |
| **"서버에 연결할 수 없어요 (tokeninfo_failed)"** | GAS의 OAuth scope 미승인. 해결: [트러블슈팅 — OAuth scope 부족](#트러블슈팅) 참조 |

## 트러블슈팅

### 1) OAuth scope 부족 (`tokeninfo_failed`)

증상: 앱에서 로그인은 되지만 "서버에 연결할 수 없어요" + 오류 코드 `tokeninfo_failed`.

원인: 배포된 GAS 웹앱이 `script.external_request` (외부 fetch) 권한을 받지 못한 상태.

해결:
1. https://myaccount.google.com/permissions 접속
2. "혜림 청소년부 출석부 백엔드" 권한 삭제
3. Apps Script IDE → Tests.gs → `runAuthTests` 선택 → ▶ 실행
4. 권한 승인 화면 → "권한 검토" → 본인 계정 → "고급" → "안전하지 않음으로 이동" → **모든 권한 허용** (시트 + 외부 서비스 연결 둘 다)
5. Apps Script IDE → 배포 → 배포 관리 → 활성 배포 → 연필(수정) → 버전 "새 버전" → 배포
6. 앱 새로고침 → 로그인 → 명단 표시 확인

### 2) 캐시 100KB 초과 (`server_error: 인수가 너무 큽니다`)

증상: getRoster 호출이 `{ok:false, code:"server_error", message:"인수(value)가 너무 큽니다."}` 반환.

원인: `CacheService.put()` 의 100KB 한계 초과. 학생 PII 데이터가 너무 클 때.

방지: Sheet.gs 의 `safeCachePut_` 헬퍼가 95KB 초과 시 캐시 저장을 silently skip 하도록 구현됨. 그래도 발생하면:
- Apps Script IDE → `invalidateCache_` 실행
- 또는 5분 대기 (캐시 자동 만료)

### 3) 배포된 웹앱이 코드 변경을 반영 안 함

증상: GAS 코드를 수정하고 저장했는데 web app 응답은 옛 코드 그대로.

원인: Apps Script 웹앱은 **배포 시점의 코드 스냅샷** 사용. 코드 수정만으로는 반영 안 됨.

해결:
1. Apps Script IDE → 배포 → 배포 관리
2. 활성 배포 → 연필(수정) → 버전 "새 버전" → 배포
3. URL은 그대로 유지됨 (재배포 불필요)

### 4) OAuth 토큰 만료 (1시간)

증상: 잘 쓰던 도중 갑자기 "로그인 확인 중..." 또는 토큰 관련 오류.

원인: Google ID Token 의 기본 만료 시간은 1시간.

해결: 페이지 새로고침 → "구글 로그인으로 로그인" 다시 클릭. 1초 내 자동 재로그인.

## 백업

- 시트 자체가 백업이며 구글이 자동 버전 보관 (파일 → 버전 기록).
- 매월 1회 `파일 → 다운로드 → xlsx` 권장.
- ATTENDANCE 탭의 데이터는 1년 누적 후 별도 시트로 archive 권장 (수만 행 누적 시 응답 속도 저하 가능).

## 향후 운영 결정 항목

| 시점 | 작업 |
|---|---|
| 1~2주 안정 운영 후 | [사본 → 원본 시트 전환](05-migrate-original-sheet.md) |
| naver 계정 교사들의 Gmail 수집 시 | TEACHERS 시트에 추가 또는 기존 행의 email 컬럼 교체 |
| 출석 누락된 교사 처리 | TEACHERS 의 role=admin 인 부장이 위임 입력 가능 (v1.0 admin 기능은 본인 반만 보이는 한계가 있어, 향후 admin 전체 반 열람 기능 추가 시 본격 가능) |
| Google 검증 신청 검토 | "확인되지 않은 앱" 경고 없애려면. 미성년자 데이터라 검증 과정이 까다로움. 14명 운영이라면 미검증 상태도 무방 |

## 시스템 구조 한 줄 요약

> `https://kyuils.github.io/youth_group/web/` (GitHub Pages 호스팅 HTML)
> → Google Identity Services 로그인 → ID Token
> → POST text/plain → Google Apps Script (배포된 웹앱)
> → ID Token 검증 (tokeninfo) + TEACHERS 시트 매칭
> → 본인 반 학생 명단 응답
> → 출석 토글 시 ATTENDANCE 시트에 UPSERT

상세 설계: [`docs/specs/2026-06-01-youth-attendance-google-sheet-design.md`](../specs/2026-06-01-youth-attendance-google-sheet-design.md)
