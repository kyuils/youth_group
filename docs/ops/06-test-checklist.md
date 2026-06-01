# E2E 테스트 체크리스트 (Spec Section 11)

배포 직후 다음 8가지를 차례로 확인. 한 항목이라도 실패하면 plan 의 해당 Task 로 돌아가 수정.

- [ ] **T1** TEACHERS 에 등록 안 된 이메일로 로그인 → "접근 권한이 없어요" 화면 표시
- [ ] **T2** 교사 A 로그인 → 본인 반 학생만 명단에 표시 (다른 반 학생 안 보임)
- [ ] **T3** 브라우저 콘솔에서 `fetch(GAS_URL, {method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({action:'setAttendance', idToken: sessionStorage.idToken, date:'2026-06-01', studentId:'<다른반 학생ID>', status:'s2'})}).then(r=>r.json()).then(console.log)` → `{ok:false, code:'forbidden'}`
- [ ] **T4** 같은 (날짜, 학생) 에 출석 → 결석 → 출석 토글. ATTENDANCE 시트에서 행 1개만 보이고 상태가 마지막 값
- [ ] **T5** 네트워크 끊고 출석 토글 → "네트워크 오류" 토스트 + 화면 상태 롤백
- [ ] **T6** 1시간 후 다시 로그인 시도 → silent refresh 또는 재로그인 모달, 작업 이어서 가능
- [ ] **T7** 시트에서 STUDENTS 에 새 학생 추가 → 앱 새로고침 시 5분 이내 반영 (캐시 만료)
- [ ] **T8** 시트에서 학생 `active=FALSE` → 명단에서 사라짐, 과거 ATTENDANCE 행은 유지
