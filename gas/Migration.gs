// Migration.gs - v1.1 only (v1.0 legacy helpers removed for safety)
//
// migration_assignMissingStudentIds 는 STUDENTS 시트가 ArrayFormula view 인 경우
// A컬럼 setValue 가 수식을 덮어써서 시트를 망가뜨립니다. v1.0 사고 재발 방지로 제거.

// a_run_v11: IDE 에서 default 선택될 수 있도록 알파벳 첫 함수.
// migration_v11_setup + migration_v11_set_roles 를 한 번에 실행.
function a_run_v11() {
  migration_v11_setup();
  migration_v11_set_roles();
  return 'v11 done';
}

function migration_v11_setup() {
  const ss = getSpreadsheet_();

  // ATTENDANCE F열에 '기타내용' 컬럼 삽입 (이미 있으면 skip)
  const att = ss.getSheetByName(SHEET_NAMES.ATTENDANCE);
  const attHeaders = att.getRange(1, 1, 1, att.getLastColumn()).getValues()[0];
  if (attHeaders[5] !== '기타내용') {
    att.insertColumnBefore(6);
    att.getRange(1, 6).setValue('기타내용');
  }

  // 기존 상태 enum 일괄 변환 s2/s3/s4/absent -> P2/P3/P4/ABSENT
  const last = att.getLastRow();
  if (last >= 2) {
    const statusRange = att.getRange(2, 5, last - 1, 1);
    const vals = statusRange.getValues();
    const map = {s2: 'P2', s3: 'P3', s4: 'P4', absent: 'ABSENT'};
    let changed = 0;
    for (let i = 0; i < vals.length; i++) {
      const cur = vals[i][0];
      if (map[cur]) { vals[i][0] = map[cur]; changed++; }
    }
    if (changed > 0) statusRange.setValues(vals);
  }

  // TEACHERS E열에 'title' 컬럼 추가
  const teachers = ss.getSheetByName(SHEET_NAMES.TEACHERS);
  const tHeaders = teachers.getRange(1, 1, 1, Math.max(teachers.getLastColumn(), 5)).getValues()[0];
  if (tHeaders[4] !== 'title') {
    teachers.getRange(1, 5).setValue('title');
  }

  // NEWCOMER_PROGRESS 시트 생성
  if (!ss.getSheetByName(SHEET_NAMES.NEWCOMER_PROGRESS)) {
    const np = ss.insertSheet(SHEET_NAMES.NEWCOMER_PROGRESS);
    np.getRange(1, 1, 1, 14).setValues([[
      '학생id','학생이름','1주','2주','3주','4주',
      '1주_날짜','2주_날짜','3주_날짜','4주_날짜',
      '등반일','등반반','기록자email','갱신시각'
    ]]);
    np.setFrozenRows(1);
  }

  // 모든 캐시 무효화
  invalidateCache_();

  Logger.log('migration_v11_setup done');
}

// ============================================================
// v1.4 마이그레이션 — 새가족부 탭 신설 + 기도제목 응답 컬럼
//   IDE에서 a_run_v14 실행 후 GAS 재배포.
// ============================================================
function a_run_v14() {
  const a = migration_v14_newcomer_tab();
  const b = migration_v14_prayer_answered();
  return a + ' / ' + b;
}

// 1) '새가족부' 탭 생성 + 기존 '새가족'(2026 반편성 P열) 인원을 비파괴적으로 복사.
//    기존 행은 삭제하지 않는다 (읽기 경로가 새가족부를 우선/별도로 사용하므로 안전).
function migration_v14_newcomer_tab() {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(SHEET_NAMES.NEWCOMER);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.NEWCOMER);
    sh.getRange(1, 1, 1, NEWCOMER_HEADERS.length).setValues([NEWCOMER_HEADERS]);
    sh.setFrozenRows(1);
  }
  // 이미 새가족부에 있는 id 집합
  const existing = {};
  readNewcomerTab_().forEach((r) => { existing[String(r.id)] = true; });

  // 2026 반편성에서 P열(16)='새가족' 행을 찾아 복사
  const raw = ss.getSheetByName(SHEET_NAMES.RAW_CLASS);
  if (!raw) throw new Error('Sheet not found: ' + SHEET_NAMES.RAW_CLASS);
  const last = raw.getLastRow();
  let copied = 0;
  if (last >= 2) {
    const vals = raw.getRange(2, 1, last - 1, 16).getValues(); // A..P
    const toAppend = [];
    vals.forEach((row) => {
      const id = row[0];                    // A 번호
      const name = String(row[2] || '').trim(); // C 이름
      const cls = String(row[15] || '').trim(); // P 반
      if (cls !== '새가족' || !name) return;
      if (existing[String(id)]) return;
      let note = String(row[13] || '');     // N 비고
      if (note.indexOf('[새가족]') === 0) note = note.replace(/^\[새가족\]\s*/, '');
      // NEWCOMER_HEADERS: id,이름,성별,연락처,생년월일,학교,학년,부모님연락처,주소,비고,등반반,등반일,active
      toAppend.push([
        id, name, row[4] || '', row[5] || '', row[6] || '',
        row[8] || '', row[9] || '', row[12] || '', row[14] || '', note,
        '', '', true,
      ]);
      existing[String(id)] = true;
      copied++;
    });
    if (toAppend.length > 0) {
      sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, NEWCOMER_HEADERS.length).setValues(toAppend);
    }
  }
  invalidateCache_(['STUDENTS_MIN_v3']);
  Logger.log('migration_v14_newcomer_tab: copied ' + copied);
  return '새가족부 복사 ' + copied + '명';
}

// 2) PRAYERS 시트에 '응답','응답일' 컬럼 추가 (없으면).
function migration_v14_prayer_answered() {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(SHEET_NAMES.PRAYERS);
  if (!sh) return 'PRAYERS 없음';
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  let added = 0;
  if (headers.indexOf('응답') < 0) { sh.getRange(1, lastCol + 1).setValue('응답'); added++; }
  const lastCol2 = sh.getLastColumn();
  const headers2 = sh.getRange(1, 1, 1, lastCol2).getValues()[0].map(String);
  if (headers2.indexOf('응답일') < 0) { sh.getRange(1, lastCol2 + 1).setValue('응답일'); added++; }
  invalidateCache_(['TEACHERS_v1']);
  Logger.log('migration_v14_prayer_answered: +' + added + ' cols');
  return '기도 응답 컬럼 +' + added;
}

function migration_v11_set_roles() {
  const ss = getSpreadsheet_();
  const teachers = ss.getSheetByName(SHEET_NAMES.TEACHERS);
  const data = teachers.getDataRange().getValues();
  const updates = {
    '황규일': {role: 'admin', title: 'dev'},
    '김지헌': {role: 'admin', title: 'pastor'},
    '최용수': {role: 'admin', title: 'head'},
    '임성희': {role: 'admin', title: 'head'},
    '곽조경': {role: 'admin', title: 'head'},
    '윤희윤': {role: 'newcomer_staff', title: 'newcomer_lead'},
  };
  let changed = 0;
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][1] || '').trim();
    if (updates[name]) {
      teachers.getRange(i+1, 3).setValue(updates[name].role); // role = C열
      teachers.getRange(i+1, 5).setValue(updates[name].title); // title = E열
      changed++;
    }
  }
  invalidateCache_(['TEACHERS_v1']);
  Logger.log('migration_v11_set_roles: ' + changed + ' rows updated');
}
