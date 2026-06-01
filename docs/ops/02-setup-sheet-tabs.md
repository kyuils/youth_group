# 구글 시트에 4개 탭 만들기

## 대상 시트
사본: https://docs.google.com/spreadsheets/d/1Pkm6kAYbF6sv8pqVHgz4LmkUNWgus18ylldDebQp7xc/edit

## 새 탭 4개 추가

### STUDENTS
첫 행에 다음 헤더 (정확한 이름, 한 줄):

```
id | 반 | 이름 | 성별 | 연락처 | 생년월일 | 초등학교 | 학교 | 학년 | 신급 | 부/모 | 부모님연락처 | 비고 | 주소 | active
```

기존 `2026년 청소년부 명단` 탭에서 데이터를 복사해 매핑:
- `번호` → `id` (빈 칸은 그대로 두면 마이그레이션 스크립트가 UUID 채움)
- `반` → `반`
- `이름` → `이름`
- ... (생년월일, 학교, 학년, 신급, 부/모, 부모님연락처, 비고, 주소 그대로)
- `active` 컬럼은 모두 `TRUE`

### TEACHERS
```
email | 이름 | role | active
```
- 14명 교사의 행. 이메일은 추후 수집되는 대로 채움.
- 부장 1명은 `role = admin`, 나머지는 `role = teacher`.
- 이메일 미보유 교사는 행은 만들되 email 칸 비워둠 (위임 입력 대상).

### ATTENDANCE
```
날짜 | 학생id | 학생이름 | 반 | 상태 | 기록자email | 기록시각
```
- 데이터 행은 비워둠 (앱이 채움).
- 헤더 행을 색칠하고 1행에 "이 탭은 앱이 자동 입력합니다. 직접 편집 금지" 메모 추가.

### PRAYERS
```
id | 학생id | 반 | 작성자email | 작성시각 | 수정시각 | 내용 | active
```

## 보호 설정

- STUDENTS 의 `id` 컬럼(A열) → 우클릭 → "범위 보호" → 본인만 편집 가능.
- ATTENDANCE 탭 전체 → 우클릭 → "시트 보호" → 본인 + GAS 만 편집 가능 (앱이 쓰므로 본인 권한이면 충분).

## 출력
- 시트 ID 메모. URL 의 `/d/<ID>/edit` 부분. 이후 GAS Script Properties 에 입력.
