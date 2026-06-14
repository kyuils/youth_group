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
  // v1.1 additions
  getNewcomers: handleGetNewcomers,
  addNewcomer: handleAddNewcomer,
  setNewcomerProgress: handleSetNewcomerProgress,
  graduate: handleGraduate,
  getAllAttendance: handleGetAllAttendance,
  getAllPrayers: handleGetAllPrayers,
  getAllRosters: handleGetAllRosters,
  // v1.4 additions
  updateStudent: handleUpdateStudent,
  setGraduationClass: handleSetGraduationClass,
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
    // Log full detail server-side for diagnosis, but return only a generic
    // code to clients. The internal message may contain sheet IDs, file
    // paths, or stack trace fragments useful to an attacker.
    console.error('[server_error]', err && err.stack ? err.stack : err);
    return jsonOut({ ok: false, code: 'server_error' });
  }
}

// Build tag — bumped whenever code is materially changed. Lets us check
// whether the deployment captured the latest IDE snapshot by hitting GET /exec.
const BUILD_TAG = 'v1.4.0-newcomer-tab-prayer-answered-student-edit';

function doGet(e) {
  // Health check only. The HTML is hosted on GitHub Pages.
  return jsonOut({ ok: true, service: 'hyerim-attendance', version: 'v1.1', build: BUILD_TAG });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
