# 사본 → 원본 시트 전환

## 전제
사본에서 1~2주 운영, 출석 데이터가 안정적으로 누적됨을 확인했음.

## 절차

1. 원본 시트 열기.
2. 사본의 STUDENTS / TEACHERS / ATTENDANCE / PRAYERS 탭을 우클릭 → "다른 스프레드시트로 복사" → 원본 선택.
3. 원본의 ATTENDANCE 탭이 새로 시작이라면 (4)~(5) 생략 가능.
4. (선택) 사본의 ATTENDANCE 데이터를 원본 ATTENDANCE 에 붙여넣기.
5. (선택) 사본의 PRAYERS 데이터도 동일하게 이관.
6. Apps Script IDE → 프로젝트 설정 → 스크립트 속성:
   - `SHEET_ID` 값을 원본 시트 ID 로 교체.
7. **재배포 불필요** — Script Properties 만 바뀌면 즉시 반영.
8. 캐시 무효화: Apps Script IDE 에서 `invalidateCache_()` 함수 1회 실행.
9. 앱에서 새로고침 → 원본 데이터가 보이는지 확인.

## 롤백
문제가 생기면 `SHEET_ID` 를 사본 ID 로 되돌리면 됨. 데이터 손실 없음.
