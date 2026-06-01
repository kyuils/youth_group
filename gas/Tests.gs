function test_verifyIdToken_rejects_empty_token() {
  const r = verifyIdToken('');
  if (r.ok !== false) throw new Error('expected ok:false for empty token');
  if (r.code !== 'no_token') throw new Error('expected code:no_token, got ' + r.code);
  Logger.log('PASS test_verifyIdToken_rejects_empty_token');
}

function test_verifyIdToken_rejects_garbage() {
  const r = verifyIdToken('not-a-real-jwt');
  if (r.ok !== false) throw new Error('expected ok:false for garbage');
  Logger.log('PASS test_verifyIdToken_rejects_garbage');
}

function runAuthTests() {
  test_verifyIdToken_rejects_empty_token();
  test_verifyIdToken_rejects_garbage();
}

function test_lookupTeacher_returns_null_for_unknown() {
  const r = lookupTeacher('nobody@nowhere.com');
  if (r !== null) throw new Error('expected null for unknown email');
  Logger.log('PASS test_lookupTeacher_returns_null_for_unknown');
}

function runSheetTests() {
  test_lookupTeacher_returns_null_for_unknown();
}
