// Auth.gs — verifies Google ID Token via tokeninfo endpoint, then maps email to TEACHERS row.

function verifyIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    return { ok: false, code: 'no_token' };
  }
  const props = PropertiesService.getScriptProperties();
  const expectedAud = props.getProperty('OAUTH_CLIENT_ID');
  if (!expectedAud) {
    return { ok: false, code: 'server_misconfig', message: 'OAUTH_CLIENT_ID missing' };
  }

  let info;
  try {
    const res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) {
      return { ok: false, code: 'invalid_token' };
    }
    info = JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false, code: 'tokeninfo_failed', message: String(e) };
  }

  if (info.aud !== expectedAud) return { ok: false, code: 'aud_mismatch' };
  if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') {
    return { ok: false, code: 'iss_mismatch' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Number(info.exp) <= now) return { ok: false, code: 'token_expired' };
  if (!info.email || info.email_verified !== 'true') {
    return { ok: false, code: 'email_unverified' };
  }

  return { ok: true, email: String(info.email).toLowerCase().trim(), name: info.name || '' };
}

// authenticate(body) → { ok, email, teacher, role } | { ok:false, code }
function authenticate(body) {
  const v = verifyIdToken(body && body.idToken);
  if (!v.ok) return v;
  const t = lookupTeacher(v.email);
  if (!t) return { ok: false, code: 'unauthorized', email: v.email };
  return { ok: true, email: v.email, teacher: t.name, role: t.role };
}
