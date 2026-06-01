// Code.gs — entry point and action router

const ACTIONS = {
  whoami: handleWhoami,
  getRoster: handleGetRoster,
  getAttendance: handleGetAttendance,
  setAttendance: handleSetAttendance,
  setAttendanceBatch: handleSetAttendanceBatch,
  getPrayers: handleGetPrayers,
  setPrayer: handleSetPrayer,
  getStudentDetail: handleGetStudentDetail,
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;
    if (!action || !ACTIONS[action]) {
      return jsonOut({ ok: false, code: 'unknown_action', action });
    }
    const handler = ACTIONS[action];
    const result = handler(body);
    return jsonOut(result);
  } catch (err) {
    console.error(err.stack || err);
    return jsonOut({ ok: false, code: 'server_error', message: String(err.message || err) });
  }
}

function doGet(e) {
  // Health check only. The HTML is hosted on GitHub Pages.
  return jsonOut({ ok: true, service: 'hyerim-attendance', version: 'v1.0' });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
