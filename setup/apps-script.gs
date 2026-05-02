// ═══════════════════════════════════════════════════════════════
//  Design AI 7.0 Survey — Google Apps Script Backend
// ═══════════════════════════════════════════════════════════════
//
//  הוראות הגדרה (פעם אחת בלבד):
//  1. פתחו Google Drive → New → Google Sheets → שמרו בשם "Design AI 7.0 Survey"
//  2. בתפריט: Extensions → Apps Script
//  3. מחקו את הקוד הקיים ← הדביקו את הקוד הזה
//  4. שנו ADMIN_PASSWORD לסיסמה שלכם
//  5. Deploy → New deployment → Web app
//     • Execute as: Me
//     • Who has access: Anyone
//  6. לחצו Deploy, אשרו הרשאות
//  7. העתיקו את ה-URL ← הכניסו לשדה CONFIG.appsScriptUrl ב-index.html וב-admin.html
// ═══════════════════════════════════════════════════════════════

const ADMIN_EMAIL    = 'info.aidesign1@gmail.com';
const ADMIN_PASSWORD = 'DesignAI2024';  // ← שנה לסיסמה שלך
const SHEET_NAME     = 'Responses';

// ── Handle POST (form submission) ──────────────────────────────
function doPost(e) {
  try {
    const raw = e.parameter && e.parameter.data ? e.parameter.data : e.postData.contents;
    const data = JSON.parse(raw);
    const id = saveResponse(data);
    sendEmailNotification(id, data);
    return jsonOk({ ok: true, id });
  } catch (err) {
    return jsonOk({ error: err.message });
  }
}

// ── Handle GET (admin / ping) ──────────────────────────────────
function doGet(e) {
  const p = e.parameter || {};

  if (p.action === 'ping') {
    return jsonOk({ ok: true });
  }

  if (p.action === 'responses' && p.password === ADMIN_PASSWORD) {
    return jsonOk(getResponses());
  }

  if (p.action === 'stats' && p.password === ADMIN_PASSWORD) {
    const rows = getResponses();
    return jsonOk({ total: rows.length, latest: rows[0] ? rows[0]['תאריך'] : null });
  }

  return jsonOk({ error: 'Unauthorized' });
}

// ── Save to Google Sheet ───────────────────────────────────────
function saveResponse(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'מזהה', 'תאריך', 'נוכחות', 'כלי AI', 'כנס עתידי',
      'מעשיות תוכן', 'דירוג אוכל', 'דירוג מיקום', 'דירוג רישום',
      'הרצאות מועדפות', 'המלצה', 'משוב חופשי', 'דירוגי מרצים'
    ]);
    sheet.setRightToLeft(true);
    sheet.getRange(1, 1, 1, 13).setFontWeight('bold')
      .setBackground('#0a0a0a').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  const id = sheet.getLastRow(); // row number = ID (row 1 = headers)
  sheet.appendRow([
    id,
    new Date().toLocaleString('he-IL'),
    data.attendance           || '',
    data.aiToolsLearned       || '',
    data.futureAttendance     || '',
    data.contentPracticality  || '',
    data.foodRating           || 0,
    data.venueRating          || 0,
    data.registrationRating   || 0,
    (data.favoriteSessions || []).join(', '),
    data.recommendation       || '',
    data.openFeedback         || '',
    JSON.stringify(data.speakerRatings || {})
  ]);

  return id;
}

// ── Read all responses ─────────────────────────────────────────
function getResponses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).reverse().map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    // Parse speaker ratings JSON back
    try { obj['דירוגי מרצים'] = JSON.parse(obj['דירוגי מרצים'] || '{}'); } catch {}
    return obj;
  });
}

// ── Send email notification ────────────────────────────────────
function sendEmailNotification(id, data) {
  const subject = `📊 תגובה חדשה לסקר Design AI 7.0 (#${id})`;
  const labels = {
    attendance: 'משך נוכחות', aiToolsLearned: 'כלי AI', futureAttendance: 'כנס עתידי',
    contentPracticality: 'מעשיות תוכן', foodRating: 'דירוג אוכל',
    venueRating: 'דירוג מיקום', registrationRating: 'דירוג רישום',
    favoriteSessions: 'הרצאות מועדפות', recommendation: 'המלצה', openFeedback: 'משוב'
  };
  const rows = Object.entries(labels).map(([k, label]) => {
    let v = data[k];
    if (!v && v !== 0) return '';
    if (Array.isArray(v)) v = v.join(', ') || '—';
    if (['foodRating','venueRating','registrationRating'].includes(k) && +v > 0) {
      v = '★'.repeat(+v) + '☆'.repeat(5 - +v);
    }
    return `<tr><td style="padding:8px 14px;background:#1a1a38;color:#a78bfa;font-weight:700">${label}</td><td style="padding:8px 14px;color:#e2e8f0">${v}</td></tr>`;
  }).join('');

  const speakerRows = data.speakerRatings
    ? Object.entries(data.speakerRatings).filter(([,v])=>+v>0)
        .map(([n,v])=>`<tr><td style="padding:7px 14px;color:#94a3b8">${n}</td><td style="padding:7px 14px;color:#f59e0b">${'★'.repeat(+v)}${'☆'.repeat(5-+v)}</td></tr>`)
        .join('')
    : '';

  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><body style="margin:0;padding:24px;background:#08081a;font-family:Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;background:#0f0f2e;border-radius:16px;overflow:hidden;border:1px solid rgba(167,139,250,.2)">
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px;text-align:center">
    <h2 style="margin:0;color:#fff">📊 תגובה חדשה לסקר</h2>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px">Design AI 7.0 · תגובה #${id}</p>
  </div>
  <div style="padding:20px">
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    ${speakerRows ? `<p style="color:#a78bfa;font-weight:700;margin:18px 0 8px">דירוגי מרצים</p><table style="width:100%;border-collapse:collapse">${speakerRows}</table>` : ''}
  </div>
  <div style="padding:14px;text-align:center;color:#475569;font-size:11px;border-top:1px solid rgba(255,255,255,.05)">
    נשלח אוטומטית ממערכת הסקר של Design AI
  </div>
</div></body></html>`;

  GmailApp.sendEmail(ADMIN_EMAIL, subject, '', { htmlBody: html });
}

// ── Utility ───────────────────────────────────────────────────
function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
