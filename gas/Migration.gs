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
