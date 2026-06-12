# 혜림교회 청소년부 출석부

14명의 교사가 본인 반 학생의 주일 출석을 구글 시트에 기록하는 웹앱.

- 사용자 페이지: **https://kyuils.github.io/youth_group/web/**
- 데이터: Google Sheet (관리자만 학생 추가/삭제 가능)
- 인증: 구글 계정 (TEACHERS 시트에 등록된 이메일만 접근)

## 빠른 시작 (운영자)

1. [Google Cloud OAuth 셋업](docs/ops/01-setup-google-cloud.md) ✅
2. [시트 4개 탭 만들기](docs/ops/02-setup-sheet-tabs.md) ✅
3. [Apps Script 배포](docs/ops/03-deploy-gas.md) ✅
4. [GitHub Pages 배포](docs/ops/04-deploy-github-pages.md) ✅
5. [E2E 테스트 체크리스트](docs/ops/06-test-checklist.md) ✅
6. [교사 공유용 안내](docs/ops/08-teacher-onboarding.md) ← 운영 시작
7. [운영자 인수인계 + 트러블슈팅](docs/ops/07-handover.md)
8. [사본 → 원본 전환](docs/ops/05-migrate-original-sheet.md) (운영 1~2주 안정 후)

## 사용자 (교사)

1. 출석부 URL 접속
2. "구글로 로그인" 클릭 → 본인 Gmail
3. (첫 로그인만) "고급" → "안전하지 않음으로 이동" → 허용
4. 본인 반 학생 출석/기도제목 입력
5. (v1.2) 하단 '현황' 탭에서 주별 출석/결석 명단 확인, 주 스테퍼(◀ ▶)로 지난 주 열람·수정

## 설계 문서

- [설계서 (spec)](docs/specs/2026-06-01-youth-attendance-google-sheet-design.md)
- [구현 계획 (plan)](docs/plans/2026-06-01-youth-attendance-implementation.md)
