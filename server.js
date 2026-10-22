import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const requiredEnv = ['BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_MB = Math.max(1, Math.min(Number(process.env.MAX_UPLOAD_MB || 25), 25));
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const REP_IDS = new Set((process.env.REP_TELEGRAM_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
const ALLOWED_IDS = new Set((process.env.ALLOWED_TELEGRAM_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
const GROUP_CHAT_ID = (process.env.TELEGRAM_GROUP_CHAT_ID || '').trim();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://telegram.org'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'", 'https://web.telegram.org', 'https://*.telegram.org'],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

const allowedMimes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png'
]);
const allowedExtensions = new Set(['.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.txt','.jpg','.jpeg','.png']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (allowedMimes.has(file.mimetype) && allowedExtensions.has(ext)) return cb(null, true);
    cb(new Error('File type not allowed. Upload PDF, Office documents, TXT, JPG, or PNG.'));
  }
});

function verifyTelegramInitData(raw) {
  if (!raw || typeof raw !== 'string') throw httpError(401, 'Open this app from Telegram to sign in.');
  const params = new URLSearchParams(raw);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) throw httpError(401, 'Telegram sign-in data is missing or invalid.');
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', process.env.BOT_TOKEN).update('WebAppData').digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const a = Buffer.from(calculatedHash, 'hex');
  const b = Buffer.from(receivedHash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw httpError(401, 'Telegram sign-in could not be verified. Reopen the app.');
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate < 1 || (Date.now() / 1000) - authDate > 86400 || authDate > Date.now() / 1000 + 60) {
    throw httpError(401, 'Your Telegram session has expired. Close and reopen the app.');
  }
  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { user = null; }
  if (!user || !Number.isSafeInteger(Number(user.id))) throw httpError(401, 'Could not identify your Telegram account.');
  return { id: String(user.id), first_name: String(user.first_name || 'Student'), username: user.username || null };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function auth(req, res, next) {
  try {
    const raw = req.get('x-telegram-init-data');
    const user = verifyTelegramInitData(raw);
    const isRep = REP_IDS.has(user.id);
    if (ALLOWED_IDS.size && !ALLOWED_IDS.has(user.id) && !isRep) {
      throw httpError(403, 'This Student Hub is restricted to your class. Ask the representative to add your Telegram ID.');
    }
    req.viewer = { ...user, isRep };
    next();
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message || 'Authentication failed.' });
  }
}

function requireRep(req, res, next) {
  if (!req.viewer?.isRep) return res.status(403).json({ error: 'Only an authorized class representative can do this.' });
  next();
}

function cleanText(value, max, field) {
  if (typeof value !== 'string') throw httpError(400, `${field} is required.`);
  const text = value.trim();
  if (!text || text.length > max) throw httpError(400, `${field} must be between 1 and ${max} characters.`);
  return text;
}
function optionalDate(value, field) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(400, `${field} is not a valid date.`);
  return date.toISOString();
}
function validatePriority(value, allowed, fallback = 'normal') {
  const v = value || fallback;
  if (!allowed.includes(v)) throw httpError(400, 'Invalid priority value.');
  return v;
}
function safeFilename(name) {
  return path.basename(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'file';
}
async function notifyGroup(text) {
  if (!GROUP_CHAT_ID) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: GROUP_CHAT_ID, text, disable_web_page_preview: true })
    });
    if (!response.ok) console.error('Telegram group notification failed:', await response.text());
  } catch (err) { console.error('Telegram notification error:', err.message); }
}
async function makeSignedResource(row) {
  const { data } = await supabase.storage.from('student-files').createSignedUrl(row.file_path, 600);
  return { ...row, download_url: data?.signedUrl || null };
}
function handleError(res, err) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File is too large. Maximum size is ${MAX_UPLOAD_MB} MB.` : err.message });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  return res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : err.message });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'Student Hub' }));

app.get('/api/bootstrap', auth, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const [subjectsRes, announcementsRes, resourcesRes] = await Promise.all([
      supabase.from('subjects').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('announcements').select('*, subjects(name, emoji)')
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100),
      supabase.from('resources').select('*, subjects(name, emoji)')
        .order('created_at', { ascending: false }).limit(200)
    ]);
    for (const result of [subjectsRes, announcementsRes, resourcesRes]) if (result.error) throw result.error;
    const resources = await Promise.all((resourcesRes.data || []).map(makeSignedResource));
    res.json({
      viewer: { id: req.viewer.id, first_name: req.viewer.first_name, username: req.viewer.username, is_rep: req.viewer.isRep },
      subjects: subjectsRes.data || [],
      announcements: announcementsRes.data || [],
      resources
    });
  } catch (err) { handleError(res, err); }
});

app.post('/api/announcements', auth, requireRep, async (req, res) => {
  try {
    const title = cleanText(req.body.title, 160, 'Title');
    const body = cleanText(req.body.body, 10000, 'Announcement');
    const priority = validatePriority(req.body.priority, ['urgent','important','normal']);
    const subject_id = req.body.subject_id || null;
    const payload = {
      title, body, priority,
      pinned: Boolean(req.body.pinned),
      subject_id,
      deadline_at: optionalDate(req.body.deadline_at, 'Deadline'),
      expires_at: optionalDate(req.body.expires_at, 'Expiry'),
      created_by: Number(req.viewer.id)
    };
    const { data, error } = await supabase.from('announcements').insert(payload).select('*, subjects(name, emoji)').single();
    if (error) throw error;
    const priorityLabel = priority === 'urgent' ? '🔴 URGENT' : priority === 'important' ? '🟠 IMPORTANT' : '📢 ANNOUNCEMENT';
    await notifyGroup(`${priorityLabel}\n${title}\n\n${body.slice(0, 700)}${body.length > 700 ? '…' : ''}\n\nOpen Student Hub to see details.`);
    res.status(201).json({ announcement: data });
  } catch (err) { handleError(res, err); }
});

app.patch('/api/announcements/:id', auth, requireRep, async (req, res) => {
  try {
    const update = {};
    if (req.body.title !== undefined) update.title = cleanText(req.body.title, 160, 'Title');
    if (req.body.body !== undefined) update.body = cleanText(req.body.body, 10000, 'Announcement');
    if (req.body.priority !== undefined) update.priority = validatePriority(req.body.priority, ['urgent','important','normal']);
    if (req.body.pinned !== undefined) update.pinned = Boolean(req.body.pinned);
    if (req.body.subject_id !== undefined) update.subject_id = req.body.subject_id || null;
    if (req.body.deadline_at !== undefined) update.deadline_at = optionalDate(req.body.deadline_at, 'Deadline');
    if (req.body.expires_at !== undefined) update.expires_at = optionalDate(req.body.expires_at, 'Expiry');
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('announcements').update(update).eq('id', req.params.id).select('*, subjects(name, emoji)').single();
    if (error) throw error;
    res.json({ announcement: data });
  } catch (err) { handleError(res, err); }
});

app.delete('/api/announcements/:id', auth, requireRep, async (req, res) => {
  try {
    const { error } = await supabase.from('announcements').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { handleError(res, err); }
});

app.post('/api/resources', auth, requireRep, upload.single('file'), async (req, res) => {
  let uploadedPath = null;
  try {
    if (!req.file) throw httpError(400, 'Choose a file to upload.');
    const title = cleanText(req.body.title, 160, 'Title');
    const description = (req.body.description || '').trim().slice(0, 2000);
    const subject_id = cleanText(req.body.subject_id, 80, 'Subject');
    const material_type = validatePriority(req.body.priority, ['important','normal']); // validate separately below for priority
    const type = req.body.material_type || 'notes';
    if (!['notes','slides','assignment','past_paper','reading','other'].includes(type)) throw httpError(400, 'Invalid material type.');
    const priority = material_type;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const file_name = safeFilename(req.file.originalname);
    const file_path = `${req.viewer.id}/${Date.now()}-${crypto.randomUUID()}${ext}`;
    const { error: uploadError } = await supabase.storage.from('student-files').upload(file_path, req.file.buffer, {
      contentType: req.file.mimetype, upsert: false
    });
    if (uploadError) throw uploadError;
    uploadedPath = file_path;
    const { data, error } = await supabase.from('resources').insert({
      title, description, subject_id, material_type: type, priority,
      file_path, file_name, file_size: req.file.size, mime_type: req.file.mimetype,
      created_by: Number(req.viewer.id)
    }).select('*, subjects(name, emoji)').single();
    if (error) throw error;
    const result = await makeSignedResource(data);
    await notifyGroup(`📚 New study material\n${data.subjects?.emoji || '📘'} ${data.subjects?.name || 'Subject'}: ${title}\nType: ${type.replace('_',' ')}${priority === 'important' ? '\n⭐ Marked important' : ''}\nOpen Student Hub to download.`);
    res.status(201).json({ resource: result });
  } catch (err) {
    if (uploadedPath) await supabase.storage.from('student-files').remove([uploadedPath]).catch(() => {});
    handleError(res, err);
  }
});

app.delete('/api/resources/:id', auth, requireRep, async (req, res) => {
  try {
    const { data: row, error: readError } = await supabase.from('resources').select('id,file_path').eq('id', req.params.id).single();
    if (readError) throw readError;
    const { error: deleteError } = await supabase.from('resources').delete().eq('id', req.params.id);
    if (deleteError) throw deleteError;
    const { error: storageError } = await supabase.storage.from('student-files').remove([row.file_path]);
    if (storageError) console.error('Could not remove file from storage:', storageError.message);
    res.json({ ok: true });
  } catch (err) { handleError(res, err); }
});

app.post('/api/subjects', auth, requireRep, async (req, res) => {
  try {
    const name = cleanText(req.body.name, 80, 'Subject name');
    const emoji = (typeof req.body.emoji === 'string' ? req.body.emoji.trim() : '📚').slice(0, 8) || '📚';
    const sort_order = Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : 0;
    const { data, error } = await supabase.from('subjects').insert({ name, emoji, sort_order }).select('*').single();
    if (error) throw error;
    res.status(201).json({ subject: data });
  } catch (err) { handleError(res, err); }
});

app.patch('/api/subjects/:id', auth, requireRep, async (req, res) => {
  try {
    const update = {};
    if (req.body.name !== undefined) update.name = cleanText(req.body.name, 80, 'Subject name');
    if (req.body.emoji !== undefined) update.emoji = String(req.body.emoji || '📚').trim().slice(0, 8) || '📚';
    if (req.body.active !== undefined) update.active = Boolean(req.body.active);
    if (req.body.sort_order !== undefined) update.sort_order = Number(req.body.sort_order) || 0;
    const { data, error } = await supabase.from('subjects').update(update).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json({ subject: data });
  } catch (err) { handleError(res, err); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((err, _req, res, _next) => handleError(res, err));

app.listen(PORT, () => console.log(`Student Hub running on http://localhost:${PORT}`));
