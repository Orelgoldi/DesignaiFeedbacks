require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();

// DATA_DIR: set to /data on Railway (Volume), fallback to project dir locally
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'responses.ndjson');
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Helpers ----
function readAll() {
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  return raw.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function appendResponse(data) {
  const id = Date.now();
  const record = { id, submitted_at: new Date().toLocaleString('he-IL'), ...data };
  fs.appendFileSync(DB_FILE, JSON.stringify(record) + '\n');
  return record;
}

function getAdminToken() {
  const email = process.env.ADMIN_EMAIL || 'info.aidesign1@gmail.com';
  const pass  = process.env.ADMIN_PASSWORD || 'DesignAI2024';
  return crypto.createHmac('sha256', pass).update(email).digest('hex');
}

function isAdmin(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.slice(7) === getAdminToken();
}

// ---- Routes ----

// Submit survey response
app.post('/api/submit', async (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'נתונים לא תקינים' });
    }
    const record = appendResponse(data);
    sendEmailNotification(record).catch(err =>
      console.error('Email failed:', err.message)
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  const adminEmail = process.env.ADMIN_EMAIL || 'info.aidesign1@gmail.com';
  const adminPass  = process.env.ADMIN_PASSWORD || 'DesignAI2024';
  if (email === adminEmail && password === adminPass) {
    res.json({ ok: true, token: getAdminToken() });
  } else {
    res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
  }
});

// Get all responses (admin)
app.get('/api/admin/responses', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'אין הרשאה' });
  res.json(readAll().reverse());
});

// Clear all responses (admin, one-time use)
app.post('/api/admin/clear', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'אין הרשאה' });
  fs.writeFileSync(DB_FILE, '');
  res.json({ ok: true });
});

// Stats (admin)
app.get('/api/admin/stats', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'אין הרשאה' });
  const all = readAll();
  res.json({ total: all.length, latest: all.at(-1)?.submitted_at });
});

// ---- Email ----
async function sendEmailNotification(record) {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  if (!emailUser || !emailPass) {
    console.log(`[#${record.id}] מייל לא מוגדר — דלג`);
    return;
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: emailUser, pass: emailPass }
  });
  const adminEmail = process.env.ADMIN_EMAIL || 'info.aidesign1@gmail.com';
  await transporter.sendMail({
    from: `"Design AI Survey" <${emailUser}>`,
    to: adminEmail,
    subject: `📊 תגובה חדשה לסקר Design AI 6.0`,
    html: buildEmailHtml(record)
  });
  console.log(`[#${record.id}] מייל נשלח ל-${adminEmail}`);
}

function buildEmailHtml(r) {
  const labels = {
    attendance: 'משך נוכחות', aiToolsLearned: 'כלי AI', futureAttendance: 'כנס הבא',
    contentPracticality: 'מעשיות תוכן', foodRating: 'אוכל', venueRating: 'מיקום',
    registrationRating: 'רישום', favoriteSessions: 'הרצאות מועדפות',
    recommendation: 'המלצה', openFeedback: 'משוב חופשי'
  };
  const skip = ['id', 'submitted_at', 'speakerRatings'];
  const rows = Object.entries(r)
    .filter(([k]) => !skip.includes(k) && labels[k])
    .map(([k, v]) => {
      const val = Array.isArray(v) ? (v.join(', ') || '—') : String(v || '—');
      const isRating = ['foodRating','venueRating','registrationRating'].includes(k);
      const display = isRating && +v > 0 ? '★'.repeat(+v) + '☆'.repeat(5 - +v) : val;
      return `<tr>
        <td style="padding:9px 14px;background:#1a1a38;color:#a78bfa;font-weight:700;white-space:nowrap">${labels[k]}</td>
        <td style="padding:9px 14px;color:#e2e8f0">${display}</td>
      </tr>`;
    }).join('');

  const speakerRows = r.speakerRatings
    ? Object.entries(r.speakerRatings)
        .filter(([, v]) => +v > 0)
        .map(([name, v]) => `<tr>
          <td style="padding:7px 14px;color:#94a3b8">${name}</td>
          <td style="padding:7px 14px;color:#f59e0b">${'★'.repeat(+v)}${'☆'.repeat(5 - +v)}</td>
        </tr>`).join('')
    : '';

  return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="margin:0;padding:24px;background:#08081a;font-family:Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;background:#0f0f2e;border-radius:16px;overflow:hidden;border:1px solid rgba(167,139,250,.2)">
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px;text-align:center">
    <h2 style="margin:0;color:#fff;font-size:20px">📊 תגובה חדשה לסקר</h2>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px">Design AI 6.0 · ${r.submitted_at}</p>
  </div>
  <div style="padding:20px">
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    ${speakerRows ? `<p style="color:#a78bfa;font-weight:700;margin:18px 0 8px">דירוגי מרצים</p>
    <table style="width:100%;border-collapse:collapse">${speakerRows}</table>` : ''}
  </div>
  <div style="padding:14px;text-align:center;color:#475569;font-size:11px;border-top:1px solid rgba(255,255,255,.05)">
    נשלח אוטומטית ממערכת ניהול הסקר של Design AI
  </div>
</div></body></html>`;
}

// ---- Rehearsal feedback ----
const REHEARSAL_DB = path.join(DATA_DIR, 'rehearsal.ndjson');
if (!fs.existsSync(REHEARSAL_DB)) fs.writeFileSync(REHEARSAL_DB, '');

function readRehearsalAll() {
  const raw = fs.readFileSync(REHEARSAL_DB, 'utf8');
  return raw.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

app.post('/api/rehearsal/submit', (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.speakerName) return res.status(400).json({ error: 'נתונים לא תקינים' });
    const sessionId = data.sessionId || 'anon';
    // Replace existing feedback for same session+speaker (allows editing)
    let records = readRehearsalAll();
    records = records.filter(r => !(r.sessionId === sessionId && r.speakerName === data.speakerName));
    const record = { id: Date.now(), submitted_at: new Date().toLocaleString('he-IL'), ...data };
    fs.writeFileSync(REHEARSAL_DB, [...records, record].map(r => JSON.stringify(r)).join('\n') + '\n');
    res.json({ ok: true, id: record.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/rehearsal/responses', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'אין הרשאה' });
  res.json(readRehearsalAll());
});

// ---- Start ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n✅  שרת הסקר פועל בהצלחה!');
  console.log(`📋  טופס הסקר:   http://localhost:${PORT}`);
  console.log(`⚙️   פאנל ניהול:  http://localhost:${PORT}/admin.html`);
  console.log(`🔑  סיסמת ניהול: DesignAI2024`);
  console.log('\n💡  להפעלת מיילים: ערוך את קובץ .env עם פרטי Gmail שלך');
  console.log('    (ראה הוראות בקובץ .env.example)\n');
});
