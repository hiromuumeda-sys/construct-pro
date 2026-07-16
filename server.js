const express = require('express');
const cors = require('cors');
const path = require('path');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { q, one } = require('./db');

// 追加テーブル（請書ファイル・招待）を冪等に用意する。
// schema.sql の再実行を待たずに動くよう、初回アクセス時に1度だけ作成する。
let _auxReady = null;
// CREATE TABLE IF NOT EXISTS は複数インスタンス同時実行で稀に重複エラー(23505/42P07)になるため握りつぶす。
async function createIfMissing(sql) {
  try { await q(sql); }
  catch (e) { if (!['23505', '42P07'].includes(e.code)) throw e; }
}
function ensureAux() {
  if (!_auxReady) {
    _auxReady = (async () => {
      await createIfMissing(`CREATE TABLE IF NOT EXISTS order_documents (
        order_id    integer primary key,
        filename    text,
        data_url    text,
        uploaded_at timestamp default current_timestamp
      )`);
      await createIfMissing(`CREATE TABLE IF NOT EXISTS invitations (
        id          serial primary key,
        email       text not null,
        name        text,
        role        text not null default 'staff',
        token       text not null unique,
        expires_at  timestamp not null,
        accepted_at timestamp,
        created_by  integer,
        created_at  timestamp default current_timestamp
      )`);
      // 支払の残金（費用と同額を初期値）。未設定は決定金額で補完。
      await createIfMissing('ALTER TABLE orders ADD COLUMN IF NOT EXISTS remaining bigint');
      await q('UPDATE orders SET remaining = decided WHERE remaining IS NULL').catch(() => {});
      // 添付書類（請書/請求書のPDF）。orders × kind ごとに1件。
      await createIfMissing(`CREATE TABLE IF NOT EXISTS order_files (
        order_id    integer,
        kind        text,
        filename    text,
        data_url    text,
        uploaded_at timestamp default current_timestamp,
        primary key (order_id, kind)
      )`);
      // 旧 order_documents（請書）から移行
      await q(`INSERT INTO order_files (order_id, kind, filename, data_url, uploaded_at)
               SELECT order_id, 'ack', filename, data_url, uploaded_at FROM order_documents
               ON CONFLICT (order_id, kind) DO NOTHING`).catch(() => {});
      // 支払登録明細（消し込み履歴）
      await createIfMissing(`CREATE TABLE IF NOT EXISTS payment_records (
        id         serial primary key,
        order_id   integer,
        paid_date  text,
        amount     bigint,
        note       text,
        created_at timestamp default current_timestamp
      )`);
    })().catch(e => { _auxReady = null; throw e; });
  }
  return _auxReady;
}

// 招待で選べる権限。フロントの表示ラベルと対応。
const INVITE_ROLES = { admin: '管理者', accounting: '経理部', staff: '一般社員' };
function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  return `${proto}://${req.headers.host}`;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

// PDF用 日本語フォント（Hiragino Sans W3 を同梱）。doc.registerFont('jp', ...) で利用。
const JP_FONT_PATH = path.join(__dirname, 'fonts', 'jp.ttc');
const JP_FONT_NAME = 'HiraginoSans-W3';
function useJpFont(doc) {
  try { doc.registerFont('jp', JP_FONT_PATH, JP_FONT_NAME); doc.font('jp'); return true; }
  catch (e) { console.error('jp font load failed:', e.message); return false; }
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' })); // 請書/請求書PDF(base64)アップロードを許容
// 静的ファイルのキャッシュ戦略（表示速度最適化）
//  - HTML: 毎回再検証（更新を即反映、コストは小さい）
//  - JS/CSS/画像など: ?v=N でバージョン管理しているため長期キャッシュ＋Vercelエッジキャッシュ(immutable)
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    }
  },
}));

// 非同期ハンドラのエラー処理ラッパ
const h = (fn) => (req, res) => fn(req, res).catch(err => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Route — デモはログイン画面を起点にする
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ============ Auth Middleware ============
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Audit log helper（記録失敗が本処理を止めないよう fail-safe にする）
const logAudit = async (userId, action, tableName, recordId, details = {}) => {
  try {
    if (!userId) return;
    // 存在しないユーザーIDだと外部キー違反になるため事前確認
    const u = await one('SELECT id FROM users WHERE id=$1', [userId]);
    if (!u) return;
    await q(
      'INSERT INTO audit_logs (user_id, action, table_name, record_id, details) VALUES ($1,$2,$3,$4,$5)',
      [userId, action, tableName, recordId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
};

// リクエストから操作者IDを取り出す（トークンが無ければ null）
const getUserId = (req) => {
  try {
    const t = req.headers.authorization?.replace('Bearer ', '');
    return t ? jwt.decode(t)?.id ?? null : null;
  } catch { return null; }
};

// 各テーブルの「列名 → 日本語ラベル」。差分表示に使う。
const FIELD_LABELS = {
  projects:   { name:'案件名', client:'顧客', clientCompany:'顧客会社', clientPhone:'電話', clientEmail:'メール', clientAddress:'住所', amount:'金額', startDate:'工期開始', endDate:'工期終了', status:'ステータス', notes:'備考' },
  orders:     { category:'工事区分', vendor:'発注先', estimate:'見積額', planned:'予算額', decided:'確定額', status:'ステータス', details:'内容', site:'現場', period_start:'開始', period_end:'終了', handover:'引渡', paymentStatus:'支払状況', paymentDate:'支払期日', paymentNotes:'支払備考' },
  vendors:    { company:'会社名', dept:'部署', contact:'担当者', email:'メール', phone:'電話', address:'住所', categories:'工事区分', bank_name:'銀行名', bank_branch:'支店', bank_type:'種別', bank_number:'口座番号', bank_holder:'口座名義' },
  customers:  { company:'会社名', department:'部署', contact:'担当者', email:'メール', phone:'電話', address:'住所', notes:'備考' },
  categories: { code:'コード', name:'名称', order:'表示順', note:'備考' },
  receipts:   { project_id:'案件', received_date:'入金日', amount:'金額', month:'対象月', memo:'備考' },
};

// 表示用に値を整形（金額はカンマ区切り、空は「(空)」）
const fmtVal = (v) => {
  if (v === null || v === undefined || v === '') return '(空)';
  const s = String(v);
  if (/^-?\d{4,}$/.test(s)) return Number(s).toLocaleString();
  return s;
};

// 対象月度を「YYYY/MM」の年月形式に正規化（「6月」等や入金日から補完）
const toYM = (v, dateStr) => {
  if (v) {
    let m = String(v).match(/(\d{4})[-/年.\s]*(\d{1,2})/);
    if (m) return `${m[1]}/${String(m[2]).padStart(2, '0')}`;
    m = String(v).match(/^\s*(\d{1,2})\s*月?\s*$/);
    if (m && dateStr) { const y = (String(dateStr).match(/(\d{4})/) || [])[1]; if (y) return `${y}/${String(m[1]).padStart(2, '0')}`; }
  }
  const d = String(dateStr || '').match(/^(\d{4})-(\d{2})/);
  if (d) return `${d[1]}/${d[2]}`;
  return v || '';
};

// 旧行と新body を比較し「ラベル: 旧 → 新」の配列を返す
const diffChanges = (table, oldRow, body) => {
  const labels = FIELD_LABELS[table] || {};
  const changes = [];
  for (const [key, label] of Object.entries(labels)) {
    if (!(key in body)) continue;
    const before = oldRow ? oldRow[key] : undefined;
    const after = body[key];
    if (String(before ?? '') !== String(after ?? '')) {
      changes.push(`${label}を ${fmtVal(before)} → ${fmtVal(after)} に変更`);
    }
  }
  return changes;
};

// ============ Auth API ============
app.post('/api/auth/signup', h(async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const existing = await one('SELECT id FROM users WHERE email=$1', [email]);
  if (existing) return res.status(409).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const user = await one('INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id,email,name,role', [email, hash, name || '', 'user']);
  await logAudit(user.id, 'CREATE', 'users', user.id, { email, name });
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}));

app.post('/api/auth/login', h(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await one('SELECT id,email,name,role,password_hash FROM users WHERE email=$1', [email]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}));

app.get('/api/auth/me', authMiddleware, h(async (req, res) => {
  const user = await one('SELECT id,email,name,role FROM users WHERE id=$1', [req.user.id]);
  res.json(user);
}));

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  res.json({ success: true });
});

// ============ Audit Log API ============
app.get('/api/audit-logs', authMiddleware, h(async (req, res) => {
  const logs = await q(`
    SELECT al.*, u.email FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC LIMIT 100
  `);
  res.json(logs);
}));

app.get('/api/audit-logs/:tableName', authMiddleware, h(async (req, res) => {
  const logs = await q(`
    SELECT al.*, u.email FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.table_name=$1
    ORDER BY al.created_at DESC LIMIT 50
  `, [req.params.tableName]);
  res.json(logs);
}));

// ============ Projects API ============
app.get('/api/projects', h(async (req, res) => {
  res.json(await q('SELECT * FROM projects ORDER BY id'));
}));

app.post('/api/projects', h(async (req, res) => {
  const { name, client, clientCompany, clientPhone, clientEmail, clientAddress, amount, startDate, endDate, status, notes } = req.body;
  const row = await one(
    `INSERT INTO projects (name, client, "clientCompany", "clientPhone", "clientEmail", "clientAddress", amount, "startDate", "endDate", status, notes, project_no)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, '') RETURNING id`,
    [name, client, clientCompany, clientPhone, clientEmail, clientAddress, amount, startDate, endDate, status, notes]
  );
  await q('UPDATE projects SET project_no=$1 WHERE id=$2', [`WW7-${String(row.id).padStart(4, '0')}`, row.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'CREATE', 'projects', row.id, { name, changes: [`新規登録（顧客: ${client || '-'} / ステータス: ${status || '-'}）`] });
  res.json({ id: row.id, ...req.body });
}));

app.put('/api/projects/:id', h(async (req, res) => {
  const { name, client, clientCompany, clientPhone, clientEmail, clientAddress, amount, startDate, endDate, status, notes, paid } = req.body;
  const before = await one('SELECT * FROM projects WHERE id=$1', [req.params.id]);
  await q(
    `UPDATE projects SET name=$1, client=$2, "clientCompany"=$3, "clientPhone"=$4, "clientEmail"=$5, "clientAddress"=$6, amount=$7, "startDate"=$8, "endDate"=$9, status=$10, notes=$11, paid=$12 WHERE id=$13`,
    [name, client, clientCompany, clientPhone, clientEmail, clientAddress, amount, startDate, endDate, status, notes, paid ? 1 : 0, req.params.id]
  );
  const userId = getUserId(req);
  await logAudit(userId, 'UPDATE', 'projects', parseInt(req.params.id), { name: before?.name || name, changes: diffChanges('projects', before, req.body) });
  res.json({ id: req.params.id, ...req.body });
}));

app.delete('/api/projects/:id', h(async (req, res) => {
  const before = await one('SELECT * FROM projects WHERE id=$1', [req.params.id]);
  await q('DELETE FROM projects WHERE id=$1', [req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'DELETE', 'projects', parseInt(req.params.id), { name: before?.name, changes: [`削除（案件: ${before?.name || '-'}）`] });
  res.json({ success: true });
}));

// ============ Vendors API ============
app.get('/api/vendors', h(async (req, res) => {
  res.json(await q('SELECT * FROM vendors ORDER BY id::int DESC'));
}));

app.post('/api/vendors', h(async (req, res) => {
  const { company, dept, contact, email, phone, address, categories, bank_name, bank_branch, bank_type, bank_number, bank_holder } = req.body;
  const row = await one('SELECT COALESCE(MAX(id::int),0) AS max FROM vendors');
  const newId = String(Number(row.max) + 1).padStart(3, '0');
  await q('INSERT INTO vendors (id, company, dept, contact, email, phone, address, categories, bank_name, bank_branch, bank_type, bank_number, bank_holder) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [newId, company, dept, contact, email, phone, address, categories || '', bank_name || '', bank_branch || '', bank_type || '', bank_number || '', bank_holder || '']);
  const userId = getUserId(req);
  await logAudit(userId, 'CREATE', 'vendors', newId, { name: company, changes: [`新規登録（発注先: ${company || '-'}）`] });
  res.json({ id: newId, ...req.body });
}));

app.put('/api/vendors/:id', h(async (req, res) => {
  const { company, dept, contact, email, phone, address, categories, bank_name, bank_branch, bank_type, bank_number, bank_holder } = req.body;
  const before = await one('SELECT * FROM vendors WHERE id=$1', [req.params.id]);
  await q('UPDATE vendors SET company=$1, dept=$2, contact=$3, email=$4, phone=$5, address=$6, categories=$7, bank_name=$8, bank_branch=$9, bank_type=$10, bank_number=$11, bank_holder=$12 WHERE id=$13',
    [company, dept, contact, email, phone, address, categories ?? before?.categories ?? '',
     bank_name ?? before?.bank_name ?? '', bank_branch ?? before?.bank_branch ?? '', bank_type ?? before?.bank_type ?? '', bank_number ?? before?.bank_number ?? '', bank_holder ?? before?.bank_holder ?? '', req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'UPDATE', 'vendors', req.params.id, { name: before?.company || company, changes: diffChanges('vendors', before, req.body) });
  res.json({ id: req.params.id, ...req.body });
}));

app.delete('/api/vendors/:id', h(async (req, res) => {
  const before = await one('SELECT * FROM vendors WHERE id=$1', [req.params.id]);
  await q('DELETE FROM vendors WHERE id=$1', [req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'DELETE', 'vendors', req.params.id, { name: before?.company, changes: [`削除（発注先: ${before?.company || '-'}）`] });
  res.json({ success: true });
}));

// ============ Categories API ============
app.get('/api/categories', h(async (req, res) => {
  res.json(await q('SELECT * FROM categories ORDER BY "order"'));
}));

app.post('/api/categories', h(async (req, res) => {
  const { name, order, note } = req.body;
  const row = await one('SELECT COALESCE(MAX(code::int),0) AS max FROM categories');
  const code = String(Number(row.max) + 1).padStart(5, '0');
  const ins = await one('INSERT INTO categories (code, name, "order", note) VALUES ($1,$2,$3,$4) RETURNING id', [code, name, order, note]);
  const userId = getUserId(req);
  await logAudit(userId, 'CREATE', 'categories', ins.id, { name, changes: [`新規登録（工事区分: ${name || '-'}）`] });
  res.json({ id: ins.id, code, name, order, note });
}));

app.put('/api/categories/:id', h(async (req, res) => {
  const { code, name, order, note } = req.body;
  const before = await one('SELECT * FROM categories WHERE id=$1', [req.params.id]);
  await q('UPDATE categories SET code=$1, name=$2, "order"=$3, note=$4 WHERE id=$5', [code, name, order, note, req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'UPDATE', 'categories', parseInt(req.params.id), { name: before?.name || name, changes: diffChanges('categories', before, req.body) });
  res.json({ id: req.params.id, ...req.body });
}));

app.delete('/api/categories/:id', h(async (req, res) => {
  const before = await one('SELECT * FROM categories WHERE id=$1', [req.params.id]);
  await q('DELETE FROM categories WHERE id=$1', [req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'DELETE', 'categories', parseInt(req.params.id), { name: before?.name, changes: [`削除（工事区分: ${before?.name || '-'}）`] });
  res.json({ success: true });
}));

// ============ Orders API ============
const ORDER_COLS = 'project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment, "paymentStatus", "paymentDate", "paymentNotes"';

app.get('/api/orders', h(async (req, res) => {
  await ensureAux();
  const [orders, files] = await Promise.all([
    q('SELECT * FROM orders ORDER BY id'),
    q("SELECT order_id, kind, filename FROM order_files"),
  ]);
  const key = (id, kind) => `${id}:${kind}`;
  const fmap = new Map(files.map(f => [key(f.order_id, f.kind), f.filename]));
  res.json(orders.map(o => ({
    ...o,
    ack_has_file: fmap.has(key(o.id, 'ack')),
    ack_filename: fmap.get(key(o.id, 'ack')) || null,
    invoice_has_file: fmap.has(key(o.id, 'invoice')),
    invoice_filename: fmap.get(key(o.id, 'invoice')) || null,
  })));
}));

// 添付PDF（請書/請求書）の種別ラベル
const FILE_KIND_LABEL = { ack: '請書', invoice: '請求書' };
const FILE_KIND_DONE = { ack: 'ack_done', invoice: 'invoice_done' };

// 請書/請求書 PDF アップロード → 対応する done フラグを true に
app.post('/api/orders/:id/file/:kind', h(async (req, res) => {
  await ensureAux();
  const kind = req.params.kind === 'invoice' ? 'invoice' : 'ack';
  const { filename, dataUrl } = req.body;
  if (!dataUrl || !/^data:application\/pdf/.test(dataUrl)) {
    return res.status(400).json({ error: 'PDFファイルを指定してください' });
  }
  const order = await one('SELECT * FROM orders WHERE id=$1', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'order not found' });
  const fallback = kind === 'invoice' ? 'invoice.pdf' : 'ukesho.pdf';
  await q(
    `INSERT INTO order_files (order_id, kind, filename, data_url, uploaded_at)
     VALUES ($1,$2,$3,$4, current_timestamp)
     ON CONFLICT (order_id, kind) DO UPDATE SET filename=$3, data_url=$4, uploaded_at=current_timestamp`,
    [req.params.id, kind, filename || fallback, dataUrl]
  );
  await q(`UPDATE orders SET ${FILE_KIND_DONE[kind]}=true WHERE id=$1`, [req.params.id]);
  await logAudit(getUserId(req), 'UPDATE', 'orders', parseInt(req.params.id), {
    name: `${order.category || ''}（${order.vendor || ''}）`,
    changes: [`${FILE_KIND_LABEL[kind]}PDFをアップロード（${filename || fallback}）／済に変更`],
  });
  res.json({ success: true });
}));

// 請書/請求書 PDF 表示（iframe からインライン参照）
app.get('/api/orders/:id/file/:kind', h(async (req, res) => {
  await ensureAux();
  const kind = req.params.kind === 'invoice' ? 'invoice' : 'ack';
  const doc = await one('SELECT * FROM order_files WHERE order_id=$1 AND kind=$2', [req.params.id, kind]);
  if (!doc || !doc.data_url) return res.status(404).json({ error: 'file not found' });
  const b64 = doc.data_url.replace(/^data:application\/pdf;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${doc.filename || (kind + '.pdf')}"`);
  res.send(buf);
}));

// 請書/請求書 PDF 削除 → 対応する done フラグを false に
app.delete('/api/orders/:id/file/:kind', h(async (req, res) => {
  await ensureAux();
  const kind = req.params.kind === 'invoice' ? 'invoice' : 'ack';
  const order = await one('SELECT * FROM orders WHERE id=$1', [req.params.id]);
  await q('DELETE FROM order_files WHERE order_id=$1 AND kind=$2', [req.params.id, kind]);
  await q(`UPDATE orders SET ${FILE_KIND_DONE[kind]}=false WHERE id=$1`, [req.params.id]);
  await logAudit(getUserId(req), 'UPDATE', 'orders', parseInt(req.params.id), {
    name: order ? `${order.category || ''}（${order.vendor || ''}）` : `#${req.params.id}`,
    changes: [`${FILE_KIND_LABEL[kind]}PDFを削除／未に変更`],
  });
  res.json({ success: true });
}));

app.post('/api/orders', h(async (req, res) => {
  await ensureAux();
  const b = req.body;
  const ins = await one(
    `INSERT INTO orders (${ORDER_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [b.project_id, b.category, b.vendor, b.estimate, b.planned, b.decided, b.status, b.details, b.site, b.period_start, b.period_end, b.handover, b.payment, b.paymentStatus || '未払い', b.paymentDate || '', b.paymentNotes || '']
  );
  // 残金の初期値＝費用（決定金額）
  await q('UPDATE orders SET remaining = $1 WHERE id = $2', [(b.remaining != null ? b.remaining : (b.decided || 0)), ins.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'CREATE', 'orders', ins.id, { name: `${b.category || ''}（${b.vendor || ''}）`, changes: [`新規登録（工事区分: ${b.category || '-'} / 発注先: ${b.vendor || '-'}）`] });
  res.json({ id: ins.id, ...b });
}));

app.put('/api/orders/:id', h(async (req, res) => {
  const b = req.body;
  const before = await one('SELECT * FROM orders WHERE id=$1', [req.params.id]);
  await q(
    `UPDATE orders SET project_id=$1, category=$2, vendor=$3, estimate=$4, planned=$5, decided=$6, status=$7, details=$8, site=$9, period_start=$10, period_end=$11, handover=$12, payment=$13, "paymentStatus"=$14, "paymentDate"=$15, "paymentNotes"=$16 WHERE id=$17`,
    [b.project_id, b.category, b.vendor, b.estimate, b.planned, b.decided, b.status, b.details, b.site, b.period_start, b.period_end, b.handover, b.payment, b.paymentStatus, b.paymentDate, b.paymentNotes, req.params.id]
  );
  const userId = getUserId(req);
  await logAudit(userId, 'UPDATE', 'orders', parseInt(req.params.id), { name: `${before?.category || b.category || ''}（${before?.vendor || b.vendor || ''}）`, changes: diffChanges('orders', before, b) });
  res.json({ id: req.params.id, ...b });
}));

app.delete('/api/orders/:id', h(async (req, res) => {
  const before = await one('SELECT * FROM orders WHERE id=$1', [req.params.id]);
  await q('DELETE FROM orders WHERE id=$1', [req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'DELETE', 'orders', parseInt(req.params.id), { name: `${before?.category || ''}（${before?.vendor || ''}）`, changes: [`削除（${before?.category || '-'} / ${before?.vendor || '-'}）`] });
  res.json({ success: true });
}));

// 請書／請求書の未済トグル（DB保存＋履歴記録）
app.put('/api/orders/:id/doc-status', h(async (req, res) => {
  const { kind, value } = req.body; // kind: 'ack' | 'invoice'
  const col = kind === 'invoice' ? 'invoice_done' : 'ack_done';
  const label = kind === 'invoice' ? '請求書' : '請書';
  const before = await one('SELECT * FROM orders WHERE id=$1', [req.params.id]);
  if (!before) return res.status(404).json({ error: 'order not found' });
  await q(`UPDATE orders SET ${col}=$1 WHERE id=$2`, [!!value, req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'UPDATE', 'orders', parseInt(req.params.id), {
    name: `${before.category || ''}（${before.vendor || ''}）`,
    changes: [`${label}を ${value ? '未 → 済' : '済 → 未'} に変更`],
  });
  res.json({ success: true });
}));

// 残金（支払の残額）を更新
app.put('/api/orders/:id/remaining', h(async (req, res) => {
  await ensureAux();
  const before = await one('SELECT * FROM orders WHERE id=$1', [req.params.id]);
  if (!before) return res.status(404).json({ error: 'order not found' });
  const value = Math.max(0, parseInt(req.body.value, 10) || 0);
  await q('UPDATE orders SET remaining=$1 WHERE id=$2', [value, req.params.id]);
  const prev = before.remaining != null ? before.remaining : before.decided;
  await logAudit(getUserId(req), 'UPDATE', 'orders', parseInt(req.params.id), {
    name: `${before.category || ''}（${before.vendor || ''}）`,
    changes: [`残金を ${fmtVal(prev)} → ${fmtVal(value)} に変更`],
  });
  res.json({ success: true });
}));

// 支払登録明細（消し込み履歴）一覧
app.get('/api/payment-records', h(async (req, res) => {
  await ensureAux();
  const rows = await q(`
    SELECT pr.*, o.category, o.vendor, o.decided, o.remaining, p.name AS project_name
    FROM payment_records pr
    LEFT JOIN orders o ON pr.order_id = o.id
    LEFT JOIN projects p ON o.project_id = p.id
    ORDER BY pr.created_at DESC`);
  res.json(rows);
}));

// 支払登録（残金から差し引き、必要に応じてステータス自動更新）
app.post('/api/payment-records', h(async (req, res) => {
  await ensureAux();
  const { order_id, note } = req.body;
  const amount = Math.max(0, parseInt(req.body.amount, 10) || 0);
  const paid_date = req.body.paid_date || new Date().toISOString().slice(0, 10);
  if (!order_id || amount <= 0) return res.status(400).json({ error: '支払額を入力してください' });
  const order = await one('SELECT * FROM orders WHERE id=$1', [order_id]);
  if (!order) return res.status(404).json({ error: 'order not found' });
  const cur = order.remaining != null ? order.remaining : (order.decided || 0);
  const newRemaining = Math.max(0, cur - amount);
  let status = order.paymentStatus;
  if (newRemaining <= 0) status = '支払済み';
  else if (newRemaining < (order.decided || 0)) status = '部分払い';
  await q('UPDATE orders SET remaining=$1, "paymentStatus"=$2 WHERE id=$3', [newRemaining, status, order_id]);
  const rec = await one('INSERT INTO payment_records (order_id, paid_date, amount, note) VALUES ($1,$2,$3,$4) RETURNING id',
    [order_id, paid_date, amount, note || '']);
  await logAudit(getUserId(req), 'CREATE', 'orders', parseInt(order_id), {
    name: `${order.category || ''}（${order.vendor || ''}）`,
    changes: [`支払登録 ¥${amount.toLocaleString()}（残金 ${fmtVal(cur)} → ${fmtVal(newRemaining)}）`],
  });
  res.json({ success: true, id: rec.id, remaining: newRemaining, status });
}));

// 支払登録明細の削除（残金を戻す）
app.delete('/api/payment-records/:id', h(async (req, res) => {
  await ensureAux();
  const rec = await one('SELECT * FROM payment_records WHERE id=$1', [req.params.id]);
  if (rec) {
    const order = await one('SELECT * FROM orders WHERE id=$1', [rec.order_id]);
    if (order) {
      const cur = order.remaining != null ? order.remaining : (order.decided || 0);
      const restored = Math.min(order.decided || (cur + rec.amount), cur + (rec.amount || 0));
      let status = order.paymentStatus;
      if (restored >= (order.decided || 0)) status = '未払い';
      else if (restored > 0) status = '部分払い';
      await q('UPDATE orders SET remaining=$1, "paymentStatus"=$2 WHERE id=$3', [restored, status, rec.order_id]);
    }
    await q('DELETE FROM payment_records WHERE id=$1', [req.params.id]);
    await logAudit(getUserId(req), 'DELETE', 'orders', rec.order_id, { name: `#${rec.order_id}`, changes: [`支払登録を取消（¥${(rec.amount || 0).toLocaleString()}）`] });
  }
  res.json({ success: true });
}));

// ============ Customers API ============
app.get('/api/customers', h(async (req, res) => {
  res.json(await q('SELECT * FROM customers ORDER BY id DESC'));
}));

app.post('/api/customers', h(async (req, res) => {
  const { company, department, contact, email, phone, address, notes } = req.body;
  const ins = await one('INSERT INTO customers (company, department, contact, email, phone, address, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [company, department, contact, email, phone, address, notes]);
  const userId = getUserId(req);
  await logAudit(userId, 'CREATE', 'customers', ins.id, { name: company, changes: [`新規登録（顧客: ${company || '-'}）`] });
  res.json({ id: ins.id, ...req.body });
}));

app.put('/api/customers/:id', h(async (req, res) => {
  const { company, department, contact, email, phone, address, notes } = req.body;
  const before = await one('SELECT * FROM customers WHERE id=$1', [req.params.id]);
  await q('UPDATE customers SET company=$1, department=$2, contact=$3, email=$4, phone=$5, address=$6, notes=$7 WHERE id=$8',
    [company, department, contact, email, phone, address, notes, req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'UPDATE', 'customers', parseInt(req.params.id), { name: before?.company || company, changes: diffChanges('customers', before, req.body) });
  res.json({ id: req.params.id, ...req.body });
}));

app.delete('/api/customers/:id', h(async (req, res) => {
  const before = await one('SELECT * FROM customers WHERE id=$1', [req.params.id]);
  await q('DELETE FROM customers WHERE id=$1', [req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'DELETE', 'customers', parseInt(req.params.id), { name: before?.company, changes: [`削除（顧客: ${before?.company || '-'}）`] });
  res.json({ success: true });
}));

// ============ Receipts API (入金・売上 F5) ============
app.get('/api/receipts', h(async (req, res) => {
  res.json(await q('SELECT * FROM receipts ORDER BY received_date DESC'));
}));

app.post('/api/receipts', h(async (req, res) => {
  const { project_id, received_date, amount, memo } = req.body;
  const month = toYM(req.body.month, received_date);
  const ins = await one('INSERT INTO receipts (project_id, received_date, amount, month, memo) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [project_id, received_date, amount, month, memo]);
  const userId = getUserId(req);
  await logAudit(userId, 'CREATE', 'receipts', ins.id, { name: month, changes: [`新規登録（${month || '-'} / ${fmtVal(amount)}円）`] });
  res.json({ id: ins.id, ...req.body });
}));

app.put('/api/receipts/:id', h(async (req, res) => {
  const { project_id, received_date, amount, memo } = req.body;
  const month = toYM(req.body.month, received_date);
  const before = await one('SELECT * FROM receipts WHERE id=$1', [req.params.id]);
  await q('UPDATE receipts SET project_id=$1, received_date=$2, amount=$3, month=$4, memo=$5 WHERE id=$6',
    [project_id, received_date, amount, month, memo, req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'UPDATE', 'receipts', parseInt(req.params.id), { name: before?.month || month, changes: diffChanges('receipts', before, req.body) });
  res.json({ id: req.params.id, ...req.body });
}));

app.delete('/api/receipts/:id', h(async (req, res) => {
  const before = await one('SELECT * FROM receipts WHERE id=$1', [req.params.id]);
  await q('DELETE FROM receipts WHERE id=$1', [req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'DELETE', 'receipts', parseInt(req.params.id), { name: before?.month, changes: [`削除（${before?.month || '-'} / ${fmtVal(before?.amount)}円）`] });
  res.json({ success: true });
}));

// 入金取込フォーマット（テンプレート）ダウンロード F5-3
app.get('/api/receipts/template', (req, res) => {
  const header = '工番,入金日,入金額,対象月度,備考';
  const sample = ['WW7-0001,2026-06-30,5000000,2026/06,着手金', 'WW7-0003,2026-06-30,3000000,2026/06,中間金'].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="receipts_template.csv"');
  res.send('﻿' + header + '\n' + sample + '\n');
});

// CSV取込による入金消込 F5-3
app.post('/api/receipts/import', h(async (req, res) => {
  const text = (req.body && req.body.csv) || '';
  if (!text.trim()) return res.status(400).json({ error: 'CSVデータが空です' });
  const parseLine = (line) => {
    const out = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
      else { if (c === '"') inQ = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
    }
    out.push(cur); return out.map(s => s.trim());
  };
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return res.status(400).json({ error: 'データ行がありません' });
  const dataLines = lines.slice(1);
  let imported = 0; const errors = [];
  for (let idx = 0; idx < dataLines.length; idx++) {
    const [projectNo, date, amountStr, month, memo] = parseLine(dataLines[idx]);
    const rowNum = idx + 2;
    if (!projectNo || !date || !amountStr) { errors.push(`${rowNum}行目: 工番・入金日・入金額は必須です`); continue; }
    const project = await one('SELECT * FROM projects WHERE project_no=$1', [projectNo]);
    if (!project) { errors.push(`${rowNum}行目: 工番「${projectNo}」が見つかりません`); continue; }
    const amount = parseInt(String(amountStr).replace(/[¥,]/g, ''), 10);
    if (isNaN(amount)) { errors.push(`${rowNum}行目: 入金額「${amountStr}」が不正です`); continue; }
    await q('INSERT INTO receipts (project_id, received_date, amount, month, memo) VALUES ($1,$2,$3,$4,$5)', [project.id, date, amount, toYM(month, date), memo || '']);
    imported++;
  }
  res.json({ imported, errors, total: dataLines.length });
}));

// 売上サマリ
app.get('/api/sales-summary', h(async (req, res) => {
  const projects = await q('SELECT * FROM projects ORDER BY id');
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const parseD = (s) => { if (!s) return null; const d = new Date(String(s).replace(/\//g, '-')); return isNaN(d) ? null : d; };
  const summary = [];
  for (const p of projects) {
    const rs = await q('SELECT * FROM receipts WHERE project_id=$1 ORDER BY received_date', [p.id]);
    const received = rs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const thisMonthReceived = rs.filter(r => r.received_date && r.received_date.startsWith(ym)).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const prevReceived = received - thisMonthReceived;
    const lastReceiptDate = rs.length ? rs[rs.length - 1].received_date : null;
    const contract = Number(p.amount) || 0;
    let payStatus = '未入金';
    if (contract > 0 && received >= contract) payStatus = '入金済';
    else if (received > 0) payStatus = '一部入金';
    // 手動上書き（receipt_status）があればそれを優先
    if (p.receipt_status) payStatus = p.receipt_status;
    const invs = await q('SELECT * FROM invoices WHERE project_id=$1', [p.id]);
    const invoiceIssued = invs.length > 0;
    const inv = invs.length ? invs[invs.length - 1] : null;
    // 完成判定：工期終了日が今日以前なら「完成」
    const en = parseD(p.endDate);
    const completed = !!(en && en <= today);
    const completedReceivable = completed ? Math.max(0, contract - received) : 0; // 完成工事未収入金
    const advanceReceived = !completed ? received : 0;                              // 未成工事受入金
    summary.push({
      id: p.id, project_no: p.project_no, name: p.name, client: p.client, status: p.status,
      contract_amount: contract, received_amount: received, outstanding: contract - received,
      this_month_received: thisMonthReceived, prev_received: prevReceived, cum_received: received,
      completed, completed_receivable: completedReceivable, advance_received: advanceReceived,
      invoice_issued: invoiceIssued, last_receipt_date: lastReceiptDate,
      pay_status: payStatus, due_date: inv ? inv.due_date : null,
    });
  }
  res.json(summary);
}));

// 入金ステータスの手動変更（DB保存＋履歴記録）
app.put('/api/projects/:id/receipt-status', h(async (req, res) => {
  const { value } = req.body;
  const before = await one('SELECT * FROM projects WHERE id=$1', [req.params.id]);
  if (!before) return res.status(404).json({ error: 'project not found' });
  const prev = before.receipt_status || '(自動)';
  await q('UPDATE projects SET receipt_status=$1 WHERE id=$2', [value, req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'UPDATE', 'receipts', parseInt(req.params.id), {
    name: before.name,
    changes: [`入金ステータスを ${prev} → ${value} に変更`],
  });
  res.json({ success: true });
}));

// ============ Invoices API (請求書 F4-2) ============
app.get('/api/invoices', h(async (req, res) => {
  res.json(await q('SELECT * FROM invoices ORDER BY id DESC'));
}));

app.post('/api/invoices', h(async (req, res) => {
  const projectId = req.body.projectId || req.body.project_id;
  const project = await one('SELECT * FROM projects WHERE id=$1', [projectId]);
  if (!project) return res.status(404).json({ error: 'プロジェクトが見つかりません' });
  const orders = await q('SELECT * FROM orders WHERE project_id=$1', [projectId]);
  const subtotal = orders.reduce((s, o) => s + (Number(o.decided) || 0), 0);
  const tax = Math.floor(subtotal * 0.1);
  const total = subtotal + tax;
  const c = await one('SELECT COUNT(*) AS cnt FROM invoices');
  const invoiceNo = `WW-${String(Number(c.cnt) + 1).padStart(3, '0')}`;
  const now = new Date();
  const invoiceDate = now.toISOString().split('T')[0];
  const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const ins = await one(
    `INSERT INTO invoices (project_id, invoice_no, registration_no, invoice_date, due_date, subtotal, tax, total, bank_info, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [projectId, invoiceNo, 'T8130001068355', invoiceDate, dueDate, subtotal, tax, total, '〇〇銀行 京都支店 (普)0777777', '発行済']
  );
  const userId = getUserId(req);
  await logAudit(userId, 'CREATE', 'invoices', ins.id, { invoice_no: invoiceNo, project_id: projectId, total });
  res.json({ id: ins.id, invoice_no: invoiceNo, project_id: projectId, subtotal, tax, total, invoice_date: invoiceDate, due_date: dueDate });
}));

app.delete('/api/invoices/:id', h(async (req, res) => {
  await q('DELETE FROM invoices WHERE id=$1', [req.params.id]);
  const userId = getUserId(req);
  await logAudit(userId, 'DELETE', 'invoices', parseInt(req.params.id), {});
  res.json({ success: true });
}));

// ============ Notifications API (通知 F7) ============
app.get('/api/notifications', h(async (req, res) => {
  const notifications = [];
  const today = new Date();
  const daysBetween = (d) => { const t = new Date(d); if (isNaN(t)) return null; return Math.ceil((t - today) / 86400000); };

  const orders = await q("SELECT * FROM orders WHERE \"paymentStatus\" != '支払済み'");
  orders.forEach(o => {
    if (!o.paymentDate) return;
    const d = daysBetween(o.paymentDate);
    if (d === null) return;
    if (d < 0) notifications.push({ type: 'payment', level: 'error', icon: 'error', title: '支払期日超過', message: `${o.vendor} への支払（${o.category}）が${Math.abs(d)}日超過しています`, date: o.paymentDate, link: '/payment.html' });
    else if (d <= 7) notifications.push({ type: 'payment', level: 'warning', icon: 'schedule', title: '支払期日接近', message: `${o.vendor} への支払（${o.category}）まであと${d}日です`, date: o.paymentDate, link: '/payment.html' });
  });

  const invoices = await q('SELECT * FROM invoices');
  for (const inv of invoices) {
    const project = await one('SELECT * FROM projects WHERE id=$1', [inv.project_id]);
    const r = await one('SELECT COALESCE(SUM(amount),0) AS total FROM receipts WHERE project_id=$1', [inv.project_id]);
    const outstanding = (Number(inv.total) || 0) - (Number(r.total) || 0);
    if (outstanding <= 0) continue;
    const d = daysBetween(inv.due_date);
    if (d === null) continue;
    const yen = '¥' + outstanding.toLocaleString();
    if (d < 0) notifications.push({ type: 'receipt', level: 'error', icon: 'error', title: '入金期日超過（未入金）', message: `${project ? project.name : '案件'}（${inv.invoice_no}）の入金期日が${Math.abs(d)}日超過・未入金残 ${yen}`, date: inv.due_date, link: '/receipts.html' });
    else if (d <= 7) notifications.push({ type: 'receipt', level: 'warning', icon: 'schedule', title: '入金期日接近', message: `${project ? project.name : '案件'}（${inv.invoice_no}）の入金期日まであと${d}日・未入金残 ${yen}`, date: inv.due_date, link: '/receipts.html' });
  }

  const wonProjects = await q("SELECT * FROM projects WHERE status = '受注'");
  for (const p of wonProjects) {
    const c = await one('SELECT COUNT(*) AS cnt FROM invoices WHERE project_id=$1', [p.id]);
    if (Number(c.cnt) === 0) notifications.push({ type: 'missing', level: 'info', icon: 'description', title: '請求書未発行', message: `${p.name} は受注済みですが請求書が未発行です`, date: null, link: '/projects.html' });
  }

  const undelivered = await q("SELECT * FROM orders WHERE status NOT IN ('発注完了', '支払済み') AND decided > 0");
  if (undelivered.length > 0) notifications.push({ type: 'missing', level: 'info', icon: 'receipt_long', title: '注文書未発行', message: `決定済みで注文書未発行の明細が${undelivered.length}件あります`, date: null, link: '/orders-list.html' });

  // デモ用テスト通知（20件）
  const demoNotifications = [
    { level: 'error', icon: 'error', title: '入金期日超過（未入金）', message: '京都御所南マンション改修工事（WW-005）の入金期日が12日超過・未入金残 ¥5,400,000', date: '2026-06-07' },
    { level: 'error', icon: 'error', title: '支払期日超過', message: 'なにわ建設株式会社 への支払（基礎工事）が8日超過しています', date: '2026-06-11' },
    { level: 'error', icon: 'error', title: '入金期日超過（未入金）', message: '下鴨神社周辺戸建住宅リノベーション（WW-008）の入金期日が3日超過・未入金残 ¥12,000,000', date: '2026-06-16' },
    { level: 'error', icon: 'error', title: '契約書未締結', message: '嵐山旅館客室改修工事 は受注済みですが契約書が未締結です', date: null },
    { level: 'error', icon: 'error', title: '予算超過', message: '丹波黒豆工場改築工事 の外注原価が請負金額を超過しています（利益率 -22.1%）', date: null },
    { level: 'warning', icon: 'schedule', title: '入金期日接近', message: '中京区三条通オフィスビル新築工事（WW-006）の入金期日まであと2日・未入金残 ¥4,800,000', date: '2026-06-21' },
    { level: 'warning', icon: 'schedule', title: '支払期日接近', message: '京都冷熱工業所 への支払（空調設備工事）まであと4日です', date: '2026-06-23' },
    { level: 'warning', icon: 'schedule', title: '支払期日接近', message: '播磨土木エンジニアリング への支払（土工事）まであと5日です', date: '2026-06-24' },
    { level: 'warning', icon: 'event', title: '竣工予定日接近', message: '丹波黒豆工場改築工事 の竣工予定まであと7日です', date: '2026-06-30' },
    { level: 'warning', icon: 'description', title: '見積回答期限', message: '福知山駅前商業施設新築 の見積回答期限が近づいています', date: '2026-06-25' },
    { level: 'warning', icon: 'inventory', title: '注文請書未回収', message: '関西電設工業 からの注文請書が未回収です（発注後14日経過）', date: null },
    { level: 'warning', icon: 'savings', title: '入金予定確認', message: '長岡京医療施設増築工事 の中間金入金予定の確認をしてください', date: '2026-06-28' },
    { level: 'info', icon: 'description', title: '請求書未発行', message: '南丹市庁舎耐震補強工事 は受注済みですが請求書が未発行です', date: null },
    { level: 'info', icon: 'task_alt', title: '工事進捗報告', message: '烏丸御池メディカルモール内装工事 の月次進捗報告が未提出です', date: null },
    { level: 'info', icon: 'group', title: '協力業者登録', message: '新規協力業者「近畿鉄骨工業」の登録申請があります', date: null },
    { level: 'info', icon: 'receipt_long', title: '注文書未発行', message: '決定済みで注文書未発行の明細が3件あります', date: null },
    { level: 'info', icon: 'percent', title: '消費税率確認', message: '請求書WW-003 の税率設定をご確認ください', date: null },
    { level: 'info', icon: 'event_note', title: '定例会議', message: '本日15時より工程定例会議が予定されています', date: '2026-06-19' },
    { level: 'info', icon: 'cloud_upload', title: 'バックアップ完了', message: '日次データバックアップが正常に完了しました', date: '2026-06-19' },
    { level: 'info', icon: 'update', title: 'システム更新', message: 'v2.4.0 へのアップデートが適用されました', date: '2026-06-18' },
  ];
  // デモ通知のタイトル/本文から遷移先を推定
  const linkFor = (n) => {
    const t = (n.title || '') + (n.message || '');
    if (/入金/.test(t)) return '/receipts.html';
    if (/支払/.test(t)) return '/payment.html';
    if (/請求書|契約書|見積|予算|利益/.test(t)) return '/projects.html';
    if (/注文|発注|請書|協力業者|竣工|工程|進捗/.test(t)) return '/orders-list.html';
    return null;
  };
  demoNotifications.forEach(n => notifications.push({ type: 'demo', link: linkFor(n), ...n }));

  const order = { error: 0, warning: 1, info: 2 };
  notifications.sort((a, b) => order[a.level] - order[b.level]);
  res.json(notifications);
}));

// ============ CSV export (会計連携 F9) ============
function toCSV(rows, headers) {
  const escape = (v) => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = headers.map(h2 => escape(h2.label)).join(',');
  const body = rows.map(r => headers.map(h2 => escape(r[h2.key])).join(',')).join('\n');
  return '﻿' + head + '\n' + body;
}

app.get('/api/export/:type', h(async (req, res) => {
  const type = req.params.type;
  let csv = '', filename = '';
  if (type === 'sales') {
    const projects = await q('SELECT * FROM projects ORDER BY id');
    const rows = [];
    for (const p of projects) {
      const r = await one('SELECT COALESCE(SUM(amount),0) AS total FROM receipts WHERE project_id=$1', [p.id]);
      const received = Number(r.total) || 0;
      rows.push({ project_no: p.project_no, name: p.name, client: p.client, contract: p.amount, received, outstanding: (Number(p.amount) || 0) - received, status: p.status });
    }
    csv = toCSV(rows, [{ key: 'project_no', label: '工番' }, { key: 'name', label: '工事名' }, { key: 'client', label: '顧客' }, { key: 'contract', label: '請負金額' }, { key: 'received', label: '入金累計' }, { key: 'outstanding', label: '未収金' }, { key: 'status', label: 'ステータス' }]);
    filename = 'sales.csv';
  } else if (type === 'receipts') {
    const rows = await q('SELECT r.*, p.name AS project_name, p.project_no FROM receipts r LEFT JOIN projects p ON r.project_id = p.id ORDER BY r.received_date DESC');
    rows.forEach(r => { r.month = toYM(r.month, r.received_date); });
    csv = toCSV(rows, [{ key: 'received_date', label: '入金日' }, { key: 'project_no', label: '工番' }, { key: 'project_name', label: '工事名' }, { key: 'amount', label: '入金額' }, { key: 'month', label: '対象月度' }, { key: 'memo', label: '備考' }]);
    filename = 'receipts.csv';
  } else if (type === 'payments') {
    const rows = await q('SELECT o.*, p.name AS project_name, p.project_no FROM orders o LEFT JOIN projects p ON o.project_id = p.id ORDER BY o.id');
    csv = toCSV(rows, [{ key: 'project_no', label: '工番' }, { key: 'project_name', label: '工事名' }, { key: 'vendor', label: '支払先' }, { key: 'category', label: '支払内容' }, { key: 'decided', label: '金額' }, { key: 'paymentDate', label: '支払期日' }, { key: 'paymentStatus', label: 'ステータス' }]);
    filename = 'payments.csv';
  } else {
    return res.status(400).json({ error: '不正なエクスポート種別です' });
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

// ============ Dashboard summary (F8) ============
app.get('/api/dashboard', h(async (req, res) => {
  const allProjects = await q('SELECT * FROM projects');
  const orders = await q('SELECT * FROM orders');
  const receipts = await q('SELECT * FROM receipts');
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const parseD = (s) => { if (!s) return null; const d = new Date(String(s).replace(/\//g, '-')); return isNaN(d) ? null : d; };

  const projects = allProjects.filter(p => { const st = parseD(p.startDate), en = parseD(p.endDate); return st && en && st <= monthEnd && en >= monthStart; });
  const monthProjectIds = new Set(projects.map(p => p.id));

  let totalReceivable = 0;
  projects.forEach(p => {
    if (['受注', '請求発行', '半金入金', '入金済'].includes(p.status)) {
      const received = receipts.filter(r => r.project_id === p.id).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const outstanding = (Number(p.amount) || 0) - received;
      if (outstanding > 0) totalReceivable += outstanding;
    }
  });
  const totalPayable = orders.filter(o => monthProjectIds.has(o.project_id) && o.paymentStatus !== '支払済み').reduce((s, o) => s + (Number(o.decided) || 0), 0);

  // 翌月の年月
  const nd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextYm = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`;
  const invoices = await q('SELECT * FROM invoices');

  // 当月売上・当月利益（売上＝工期開始月の契約金額、利益＝売上−注文確定額）
  const monthRevProjects = allProjects.filter(p => ymOfDate(p.startDate) === ym);
  const monthRevIds = new Set(monthRevProjects.map(p => p.id));
  const thisMonthRevenue = monthRevProjects.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const thisMonthRevCost = orders.filter(o => monthRevIds.has(o.project_id)).reduce((s, o) => s + (Number(o.decided) || 0), 0);
  const thisMonthProfit = thisMonthRevenue - thisMonthRevCost;

  // 入金予定＝請求書の支払期日が該当月のもの（請求総額）
  const dueSum = (m) => invoices.filter(i => i.due_date && i.due_date.startsWith(m)).reduce((s, i) => s + (Number(i.total) || 0), 0);
  const thisMonthReceipts = dueSum(ym);
  const nextMonthReceipts = dueSum(nextYm);

  // 支払予定＝注文の支払期日が該当月で未払いのもの
  const paySum = (m) => orders.filter(o => o.paymentStatus !== '支払済み' && o.paymentDate && o.paymentDate.startsWith(m)).reduce((s, o) => s + (Number(o.decided) || 0), 0);
  const thisMonthPayments = paySum(ym);
  const nextMonthPayments = paySum(nextYm);

  // 未入金総金額＝（請求済み総額 − 入金済み総額）の正値合計（案件単位）
  let totalUnpaid = 0;
  allProjects.forEach(p => {
    const billed = invoices.filter(i => i.project_id === p.id).reduce((s, i) => s + (Number(i.total) || 0), 0);
    const received = receipts.filter(r => r.project_id === p.id).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const outstanding = billed - received;
    if (outstanding > 0) totalUnpaid += outstanding;
  });

  const projectProfit = projects.map(p => {
    const po = orders.filter(o => o.project_id === p.id);
    const cost = po.reduce((s, o) => s + (Number(o.decided) || 0), 0);
    const revenue = Number(p.amount) || 0;
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue * 100) : 0;
    return { id: p.id, project_no: p.project_no, name: p.name, revenue, cost, profit, margin: Math.round(margin * 10) / 10, status: p.status, startDate: p.startDate, endDate: p.endDate };
  });
  const totalRevenue = projectProfit.reduce((s, p) => s + p.revenue, 0);
  const totalCost = projectProfit.reduce((s, p) => s + p.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue * 1000)) / 10 : 0;

  res.json({ month: ym, activeCount: projects.length, totalReceivable, totalPayable, thisMonthRevenue, thisMonthProfit, thisMonthReceipts, thisMonthPayments, nextMonthReceipts, nextMonthPayments, totalUnpaid, totalRevenue, totalCost, totalProfit, avgMargin, projectProfit: projectProfit.sort((a, b) => b.revenue - a.revenue) });
}));

// ============ レポート（受注・入金推移）：月次の売上・利益 ============
// 売上＝案件の工期開始月に計上した契約金額、原価＝その案件の注文確定額、利益＝売上−原価。
// from/to（YYYY-MM）で対象期間可変。未指定時は当月から過去12ヶ月。
const ymOfDate = (s) => { if (!s) return null; const m = String(s).replace(/\//g, '-').match(/^(\d{4})-(\d{2})/); return m ? `${m[1]}-${m[2]}` : null; };
function monthRange(from, to) {
  // from/to: 'YYYY-MM'。連続した月の配列を返す。
  const list = [];
  let [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (fy < ty || (fy === ty && fm <= tm)) {
    list.push(`${fy}-${String(fm).padStart(2, '0')}`);
    fm++; if (fm > 12) { fm = 1; fy++; }
    if (list.length > 120) break;
  }
  return list;
}
async function buildReportData(from, to) {
  const now = new Date();
  if (!to) to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (!from) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const projects = await q('SELECT * FROM projects');
  const orders = await q('SELECT * FROM orders');
  const projMonth = {};               // project_id -> ym
  const map = {};                     // ym -> { revenue, cost }
  const ensure = (ym) => (map[ym] = map[ym] || { revenue: 0, cost: 0 });
  projects.forEach(p => {
    const ym = ymOfDate(p.startDate);
    projMonth[p.id] = ym;
    if (ym) ensure(ym).revenue += Number(p.amount) || 0;
  });
  orders.forEach(o => {
    const ym = projMonth[o.project_id];
    if (ym) ensure(ym).cost += Number(o.decided) || 0;
  });
  const months = monthRange(from, to);
  const points = months.map(ym => {
    const v = map[ym] || { revenue: 0, cost: 0 };
    return { ym, revenue: v.revenue, profit: v.revenue - v.cost };
  });
  const totalRevenue = points.reduce((s, p) => s + p.revenue, 0);
  const totalProfit = points.reduce((s, p) => s + p.profit, 0);
  return { points, totalRevenue, totalProfit, from, to };
}

app.get('/api/report/growth', h(async (req, res) => {
  res.json(await buildReportData(req.query.from, req.query.to));
}));

// レポートPDF（売上の棒グラフ＋利益の折れ線）
app.get('/api/report/growth-pdf', h(async (req, res) => {
  const { points, totalRevenue, totalProfit, from, to } = await buildReportData(req.query.from, req.query.to);
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape', bufferPages: true });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  await new Promise((resolve, reject) => {
    doc.on('end', resolve); doc.on('error', reject);
    // 色：ヘッダー＝青強めネイビー、グラフ＝Web画面と同色（棒=#7c6cf6 / 線=#030424）
    const headerNavy = '#1e2a78', barColor = '#7c6cf6', lineColor = '#030424';
    useJpFont(doc); // 日本語フォントを適用
    const pageW = doc.page.width;
    // ヘッダー（高さを小さく：80→48）
    doc.rect(0, 0, pageW, 48).fill(headerNavy);
    doc.fillColor('white').fontSize(15).text('WIN WIN', 40, 9);
    doc.fontSize(10).fillColor('#cdd3f0').text('レポート（受注・入金推移）', 40, 30);
    doc.fillColor('black');

    doc.fontSize(12).text(`売上・利益レポート　${from} 〜 ${to}`, 40, 68);
    doc.fontSize(10).fillColor('black');
    doc.text(`売上合計：¥${totalRevenue.toLocaleString()}`, 40, 90);
    doc.text(`利益合計：¥${totalProfit.toLocaleString()}`, 320, 90);

    const chartX = 60, chartY = 140, chartW = pageW - 120, chartH = 330;
    doc.lineWidth(1).strokeColor('#d1d5db');
    doc.moveTo(chartX, chartY).lineTo(chartX, chartY + chartH).stroke();
    doc.moveTo(chartX, chartY + chartH).lineTo(chartX + chartW, chartY + chartH).stroke();
    const maxV = Math.max(1, ...points.map(p => Math.max(p.revenue, p.profit)));
    const n = points.length || 1;
    const slot = chartW / n;
    const barW = Math.min(30, slot * 0.5);
    // Sales bars（Web同色・半透明）
    points.forEach((p, i) => {
      const hh = (p.revenue / maxV) * (chartH - 10);
      const x = chartX + slot * i + (slot - barW) / 2;
      const y = chartY + chartH - hh;
      doc.save().fillOpacity(0.55).fill(barColor);
      doc.rect(x, y, barW, hh).fill();
      doc.restore();
      doc.fillColor('#6b7280').fontSize(6).text(p.ym.replace('-', '/').slice(2), chartX + slot * i, chartY + chartH + 4, { width: slot, align: 'center' });
      doc.fillColor('black');
    });
    // Profit line
    doc.strokeColor(lineColor).lineWidth(2);
    points.forEach((p, i) => {
      const x = chartX + slot * i + slot / 2;
      const y = chartY + chartH - (p.profit / maxV) * (chartH - 10);
      if (i === 0) doc.moveTo(x, y); else doc.lineTo(x, y);
    });
    doc.stroke();
    // 凡例
    doc.save().fillOpacity(0.55).fillColor(barColor).rect(chartX, chartY - 22, 12, 12).fill().restore();
    doc.fillColor('#333').fontSize(9).text('売上', chartX + 16, chartY - 21);
    doc.strokeColor(lineColor).lineWidth(2).moveTo(chartX + 56, chartY - 16).lineTo(chartX + 76, chartY - 16).stroke();
    doc.fillColor('#333').text('利益', chartX + 80, chartY - 21);
    doc.fillColor('#888').fontSize(8).text('※ 売上＝案件の工期開始月の契約金額、利益＝売上−注文確定額', 40, chartY + chartH + 24);
    doc.end();
  });
  const pdf = Buffer.concat(chunks);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="report-sales-profit.pdf"`);
  res.send(pdf);
}));

// ============ Cache endpoint ============
app.get('/api/cache', h(async (req, res) => {
  await ensureAux();
  const [projects, vendors, categories, orders, customers, receipts, invoices, files] = await Promise.all([
    q('SELECT * FROM projects ORDER BY id'),
    q('SELECT * FROM vendors ORDER BY id::int DESC'),
    q('SELECT * FROM categories ORDER BY "order"'),
    q('SELECT * FROM orders ORDER BY id'),
    q('SELECT * FROM customers ORDER BY id DESC'),
    q('SELECT * FROM receipts ORDER BY received_date DESC'),
    q('SELECT * FROM invoices ORDER BY id DESC'),
    q('SELECT order_id, kind, filename FROM order_files'),
  ]);
  // 請書/請求書PDFの添付状況をマージ（/api/orders と同じ）
  const fkey = (id, kind) => `${id}:${kind}`;
  const fmap = new Map(files.map(f => [fkey(f.order_id, f.kind), f.filename]));
  const ordersWithFiles = orders.map(o => ({
    ...o,
    ack_has_file: fmap.has(fkey(o.id, 'ack')),
    ack_filename: fmap.get(fkey(o.id, 'ack')) || null,
    invoice_has_file: fmap.has(fkey(o.id, 'invoice')),
    invoice_filename: fmap.get(fkey(o.id, 'invoice')) || null,
  }));
  res.json({ projects, vendors, categories, orders: ordersWithFiles, customers, receipts, invoices });
}));

app.get('/api/test', (req, res) => res.json({ status: 'ok', message: 'Server is running' }));

// ============ PDF: 請求書 ============
// 請求書／見積書を画面プレビューと同じデザインで生成（日本語フォント埋め込み）
// 自社情報（テンプレートに準拠）
const COMPANY = {
  name: '株式会社WIN WIN',
  rep: '磯田 裕晃',
  zip: '〒604-0924',
  addrOrder: '京都市中京区河原町通二条下る一之船入町537-20 FIS御池ビル505号',
  addrInv: '京都市中京区一之船入町537-20 FIS御池ビル505号',
  tel: 'TEL : 075-777-1236',
  regNo: 'T8130001068355',
  bank: '〇〇銀行 京都支店',
  account: '(普)0777777',
};
const fmtDateJa = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
const toWareki = (d) => ({ y: d.getFullYear() - 2018, m: d.getMonth() + 1, d: d.getDate() }); // 令和

// 注文書／注文請書（添付テンプレートの項目リスト形式）
function renderOrderAckSheet(doc, mode, { vendorName, vendorAddr, fields, wareki }) {
  const L = 55, R = 540, W = R - L;
  const pageW = doc.page.width;
  let y = 56;
  const title = mode === 'order' ? '注文書' : '注文請書';
  doc.fillColor('#000').fontSize(22).text(title, 0, y, { align: 'center', characterSpacing: 8, width: pageW });
  doc.moveTo(pageW / 2 - 70, y + 30).lineTo(pageW / 2 + 70, y + 30).lineWidth(1).strokeColor('#000').stroke();
  y += 50;
  // 宛先
  const recipient = (mode === 'order' ? (vendorName || '-') : COMPANY.name) + '　殿';
  doc.fontSize(12).text(recipient, L, y); y += 24;
  // リード文
  doc.fontSize(9);
  if (mode === 'order') {
    doc.text('貴社に対し下記のとおりご注文申し上げます。', L, y); y += 13;
    doc.text('なお、工事注文確認の為、注文請書のご返送よろしくお願いいたします。', L, y); y += 20;
  } else {
    doc.text('貴社に対し、下記のとおり工事注文お請け致します。', L, y); y += 20;
  }
  // 項目リスト（ラベル枠＋値枠）
  const wLabel = 165, wVal = W - wLabel, pad = 6;
  fields.forEach(([label, val]) => {
    const lbl = '□ ' + label;
    const v = String(val == null ? '' : val);
    const lh = doc.fontSize(9).heightOfString(lbl, { width: wLabel - 2 * pad });
    const vh = doc.fontSize(9).heightOfString(v, { width: wVal - 2 * pad });
    const h = Math.max(lh, vh, 16) + 2 * pad;
    doc.lineWidth(0.8).strokeColor('#333');
    doc.rect(L, y, wLabel, h).stroke();
    doc.rect(L + wLabel, y, wVal, h).stroke();
    doc.fillColor('#000').fontSize(9).text(lbl, L + pad, y + pad, { width: wLabel - 2 * pad });
    doc.text(v, L + wLabel + pad, y + pad, { width: wVal - 2 * pad });
    y += h;
  });
  y += 24;
  // 日付
  const dateStr = (mode === 'order' && wareki)
    ? `令和　${wareki.y}年 ${wareki.m}月　${wareki.d}日`
    : '令和　　　年　　　月　　　日';
  doc.fontSize(10).text(dateStr, L, y); y += 26;
  // 署名欄
  const who = mode === 'order' ? '注文者' : '請負者';
  const sx = L + 30, vx = sx + 70;
  doc.fontSize(10).text(who, L, y);
  const addr = mode === 'order' ? COMPANY.addrOrder : (vendorAddr || '');
  const comp = mode === 'order' ? COMPANY.name : (vendorName || '');
  const rep = mode === 'order' ? COMPANY.rep : '';
  doc.fontSize(9);
  doc.text('住所', sx, y); doc.text(addr, vx, y, { width: R - vx - 40 });
  const ah = Math.max(doc.heightOfString(addr || ' ', { width: R - vx - 40 }), 14);
  y += ah + 8;
  doc.text('会社名', sx, y); doc.text(comp, vx, y, { width: R - vx - 40 }); y += 20;
  doc.text('代表者名', sx, y); doc.text(rep, vx, y, { width: 180 });
  // 印
  doc.lineWidth(0.8).strokeColor('#999').rect(R - 36, y - 6, 32, 32).stroke();
  doc.fillColor('#999').fontSize(8).text('印', R - 36, y + 4, { width: 32, align: 'center' });
  doc.fillColor('#000');
}

// ============ PDF: 発注書（注文書＋注文請書） ============
function buildPurchaseOrderPDF(order, project, vendor) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    useJpFont(doc);
    const net = Number(order.decided || order.planned || order.estimate) || 0;
    const tax = Math.floor(net * 0.1);
    const total = net + tax;
    const vendorName = (vendor && vendor.company) || order.vendor || '-';
    const vendorAddr = (vendor && vendor.address) || '';
    const period = (order.period_start || order.period_end)
      ? `着手予定　${order.period_start || '-'}　～　完成予定　${order.period_end || '-'}` : '-';
    const fields = [
      ['工事名', project ? project.name : (order.details || '-')],
      ['工事内容', order.category || order.details || '-'],
      ['工事場所', order.site || '-'],
      ['工事期間', period],
      ['検査及び引渡し時期\n　　（施主に対して）', order.handover || '-'],
      ['請負代金', `￥${total.toLocaleString()}（内消費税額　￥${tax.toLocaleString()}　）`],
      ['支払条件／支払方法', order.payment || '-'],
    ];
    renderOrderAckSheet(doc, 'order', { vendorName, vendorAddr, fields, wareki: toWareki(new Date()) });
    doc.end();
  });
}

// ============ PDF: 請求書／見積書（添付テンプレートの明細表形式） ============
function buildDocumentPDF(kind, project, orders) {
  const isInvoice = kind === 'invoice';
  const amt = isInvoice
    ? (o) => Number(o.decided) || 0
    : (o) => Number(o.estimate) || Number(o.planned) || Number(o.decided) || 0;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    useJpFont(doc);
    const navy = '#030424', gray = '#6b7280', accent = '#7030A0'; // accent=Excelテンプレの紫
    const L = 50, R = 545, W = R - L;
    const now = new Date();
    const due = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const subtotal = orders.reduce((s, o) => s + amt(o), 0);
    const tax = Math.floor(subtotal * 0.1);
    const total = subtotal + tax;
    const title = isInvoice ? '請　求　書' : '見　積　書';
    const no = (isInvoice ? 'WW-' : 'EST-') + String(project.id).padStart(3, '0');
    const pageW = doc.page.width;

    let y = 50;
    // タイトル（中央）
    doc.fillColor(accent).fontSize(22).text(title, 0, y, { align: 'center', characterSpacing: 8, width: pageW });
    doc.moveTo(pageW / 2 - 78, y + 30).lineTo(pageW / 2 + 78, y + 30).lineWidth(1).strokeColor(accent).stroke();
    doc.fillColor('#000');
    y += 54;
    // 宛先（左）
    const client = (project.clientCompany || project.client || '') + '　御中';
    doc.fontSize(13).text(client, L, y);
    doc.moveTo(L, y + 20).lineTo(L + Math.max(doc.widthOfString(client), 170), y + 20).lineWidth(1).strokeColor('#000').stroke();
    // 右：番号・登録番号＋自社
    let ry = y - 6;
    doc.fontSize(8).fillColor('#000').text((isInvoice ? '請求№　' : '見積№　') + no, R - 260, ry, { width: 260, align: 'right' }); ry += 11;
    if (isInvoice) { doc.text('適格請求書発行事業者登録番号　' + COMPANY.regNo, R - 260, ry, { width: 260, align: 'right' }); ry += 13; }
    doc.fontSize(11).text(COMPANY.name, R - 250, ry, { width: 250, align: 'right' }); ry += 15;
    doc.fontSize(8).fillColor(gray);
    [COMPANY.zip, COMPANY.addrInv, COMPANY.tel].forEach(t => { doc.text(t, R - 250, ry, { width: 250, align: 'right' }); ry += 11; });
    doc.fillColor('#000');
    y += 48;
    // 件名・リード
    doc.fontSize(9).text('件名：' + (project.name || ''), L, y); y += 15;
    doc.text(isInvoice ? '下記のとおり御請求申し上げます。' : '下記のとおり御見積申し上げます。', L, y); y += 20;
    // 合計金額ボックス＋日付
    const boxW = 250, boxH = 46;
    doc.lineWidth(1.2).strokeColor(accent).rect(L, y, boxW, boxH).stroke();
    doc.fontSize(10).fillColor(accent).text(isInvoice ? '合計金額（税込）' : '御見積金額（税込）', L + 8, y + 6);
    doc.fontSize(18).fillColor('#000').text('¥' + total.toLocaleString(), L + 6, y + 20, { width: boxW - 12, align: 'right' });
    doc.fillColor('#000').fontSize(9);
    doc.text((isInvoice ? '請求日：' : '見積日：') + fmtDateJa(now), L + boxW + 24, y + 8);
    doc.text((isInvoice ? 'お支払期限：' : '有効期限：') + fmtDateJa(due), L + boxW + 24, y + 26);
    y += boxH + 8;
    if (isInvoice) { doc.fontSize(8).text(`[振込先]　${COMPANY.bank}　／　口座番号　${COMPANY.account}`, L, y); y += 16; }
    else y += 4;

    // 明細テーブル
    const cols = [
      { k: 'name', label: '品　　名', w: 180, align: 'left' },
      { k: 'qty', label: '数量', w: 40, align: 'right' },
      { k: 'unit', label: '単位', w: 35, align: 'center' },
      { k: 'price', label: '単価', w: 80, align: 'right' },
      { k: 'amount', label: '金　額', w: 85, align: 'right' },
      { k: 'note', label: '摘要', w: W - 420, align: 'left' },
    ];
    const rowH = 22;
    const drawRow = (vals, opts = {}) => {
      let cx = L;
      const isH = opts.headerBg;
      cols.forEach(c => {
        if (isH) doc.fillColor(accent).rect(cx, y, c.w, rowH).fill();
        doc.lineWidth(0.6).strokeColor(isH ? accent : '#999').rect(cx, y, c.w, rowH).stroke();
        const v = vals[c.k];
        if (v !== undefined && v !== '') doc.fillColor(isH ? '#fff' : '#000').fontSize(9).text(String(v), cx + 4, y + 6, { width: c.w - 8, align: c.align });
        cx += c.w;
      });
      y += rowH;
    };
    drawRow(cols.reduce((a, c) => (a[c.k] = c.label, a), {}), { headerBg: true });
    const items = orders.length ? orders.slice() : [];
    const minRows = 6;
    const rowsN = Math.max(items.length, minRows);
    for (let i = 0; i < rowsN; i++) {
      if (y > 700) { doc.addPage(); y = 50; }
      const o = items[i];
      if (o) {
        const a = amt(o);
        drawRow({ name: o.category || '一式', qty: 1, unit: '式', price: '¥' + a.toLocaleString(), amount: '¥' + a.toLocaleString(), note: '' });
      } else {
        drawRow({});
      }
    }
    // 合計ブロック（右寄せ）
    y += 10;
    const tlX = R - 220, tvX = R - 100;
    const totalRow = (label, val, bold) => {
      doc.lineWidth(bold ? 1 : 0.6).strokeColor(bold ? accent : '#999');
      doc.rect(tlX, y, 120, 20).stroke();
      doc.rect(tlX + 120, y, 100, 20).stroke();
      doc.fillColor(bold ? accent : '#000').fontSize(bold ? 11 : 9).text(label, tlX + 6, y + (bold ? 4 : 6));
      doc.fontSize(bold ? 11 : 9).text(val, tlX + 124, y + (bold ? 4 : 6), { width: 92, align: 'right' });
      y += 20;
    };
    totalRow('小　　計', '¥' + subtotal.toLocaleString());
    totalRow('税率', '10%');
    totalRow('消費税', '¥' + tax.toLocaleString());
    totalRow('合　　計', '¥' + total.toLocaleString(), true);

    // 注記（見積書のみ・合計直下に配置して余白ページを作らない）
    if (!isInvoice) { y += 18; doc.fillColor(gray).fontSize(8).text('※本見積書の有効期限は発行日より30日間です。', L, y); }
    doc.end();
  });
}
function buildInvoicePDF(project, orders) { return buildDocumentPDF('invoice', project, orders); }
function buildEstimatePDF(project, orders) { return buildDocumentPDF('estimate', project, orders); }

function makeTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '' },
  });
}

// 発注書 PDF
app.get('/api/po/:orderId', h(async (req, res) => {
  const order = await one('SELECT * FROM orders WHERE id=$1', [req.params.orderId]);
  if (!order) return res.status(404).json({ error: '発注明細が見つかりません' });
  const project = await one('SELECT * FROM projects WHERE id=$1', [order.project_id]);
  const vendor = await one('SELECT * FROM vendors WHERE company=$1', [order.vendor]);
  const pdfBuffer = await buildPurchaseOrderPDF(order, project, vendor);
  const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="po-${order.id}.pdf"`);
  res.send(pdfBuffer);
}));

// 発注書 メール送信
app.post('/api/po/send', h(async (req, res) => {
  const { orderId, to, subject, body } = req.body;
  if (!orderId || !to || !subject) return res.status(400).json({ error: '必須パラメータが不足しています' });
  const order = await one('SELECT * FROM orders WHERE id=$1', [orderId]);
  if (!order) return res.status(404).json({ error: '発注明細が見つかりません' });
  const project = await one('SELECT * FROM projects WHERE id=$1', [order.project_id]);
  const vendor = await one('SELECT * FROM vendors WHERE company=$1', [order.vendor]);
  const pdfBuffer = await buildPurchaseOrderPDF(order, project, vendor);
  await makeTransporter().sendMail({
    from: process.env.MAIL_FROM || 'CONSTRUCT_PRO <noreply@construct-pro.jp>',
    to, subject, text: body || '',
    attachments: [{ filename: `po-${String(order.id).padStart(5, '0')}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
  });
  res.json({ success: true });
}));

// 請求書 PDF
app.get('/api/invoice/project/:projectId', h(async (req, res) => {
  const project = await one('SELECT * FROM projects WHERE id=$1', [req.params.projectId]);
  if (!project) return res.status(404).json({ error: 'プロジェクトが見つかりません' });
  const orders = await q('SELECT * FROM orders WHERE project_id=$1', [req.params.projectId]);
  const pdfBuffer = await buildInvoicePDF(project, orders);
  const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="invoice-${project.id}.pdf"`);
  res.send(pdfBuffer);
}));

// 請求書 メール送信
app.post('/api/invoice/send', h(async (req, res) => {
  const { projectId, to, subject, body } = req.body;
  if (!projectId || !to || !subject) return res.status(400).json({ error: '必須パラメータが不足しています' });
  const project = await one('SELECT * FROM projects WHERE id=$1', [projectId]);
  if (!project) return res.status(404).json({ error: 'プロジェクトが見つかりません' });
  const orders = await q('SELECT * FROM orders WHERE project_id=$1', [projectId]);
  const pdfBuffer = await buildInvoicePDF(project, orders);
  await makeTransporter().sendMail({
    from: process.env.MAIL_FROM || 'CONSTRUCT_PRO <noreply@construct-pro.jp>',
    to, subject, text: body || '',
    attachments: [{ filename: `invoice-${String(project.id).padStart(5, '0')}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
  });
  res.json({ success: true });
}));

// 見積書 PDF
app.get('/api/estimate/project/:projectId', h(async (req, res) => {
  const project = await one('SELECT * FROM projects WHERE id=$1', [req.params.projectId]);
  if (!project) return res.status(404).json({ error: 'プロジェクトが見つかりません' });
  const orders = await q('SELECT * FROM orders WHERE project_id=$1', [req.params.projectId]);
  const pdfBuffer = await buildEstimatePDF(project, orders);
  const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="estimate-${project.id}.pdf"`);
  res.send(pdfBuffer);
}));

// 見積書 メール送信
app.post('/api/estimate/send', h(async (req, res) => {
  const { projectId, to, subject, body } = req.body;
  if (!projectId || !to || !subject) return res.status(400).json({ error: '必須パラメータが不足しています' });
  const project = await one('SELECT * FROM projects WHERE id=$1', [projectId]);
  if (!project) return res.status(404).json({ error: 'プロジェクトが見つかりません' });
  const orders = await q('SELECT * FROM orders WHERE project_id=$1', [projectId]);
  const pdfBuffer = await buildEstimatePDF(project, orders);
  await makeTransporter().sendMail({
    from: process.env.MAIL_FROM || 'CONSTRUCT_PRO <noreply@construct-pro.jp>',
    to, subject, text: body || '',
    attachments: [{ filename: `estimate-${String(project.id).padStart(5, '0')}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
  });
  res.json({ success: true });
}));

// ============ アカウント発行（招待）API ============
// 招待状態を算出
function inviteStatus(inv) {
  if (inv.accepted_at) return '登録済み';
  if (new Date(inv.expires_at) < new Date()) return '期限切れ';
  return '有効';
}

// 招待一覧（管理画面用）。24時間を過ぎた未受諾の招待は「招待中」から消す（自動削除）。
app.get('/api/invitations', authMiddleware, h(async (req, res) => {
  await ensureAux();
  await q('DELETE FROM invitations WHERE accepted_at IS NULL AND expires_at < now()');
  const rows = await q('SELECT id, email, name, role, expires_at, accepted_at, created_at FROM invitations ORDER BY created_at DESC LIMIT 50');
  res.json(rows.map(r => ({ ...r, roleLabel: INVITE_ROLES[r.role] || r.role, status: inviteStatus(r) })));
}));

// 招待を発行（24時間有効）＋ 招待メール送信
app.post('/api/invitations', authMiddleware, h(async (req, res) => {
  await ensureAux();
  const { name, email, role } = req.body;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: '有効なメールアドレスを入力してください' });
  if (!INVITE_ROLES[role]) return res.status(400).json({ error: '権限を選択してください' });
  const existing = await one('SELECT id FROM users WHERE email=$1', [email]);
  if (existing) return res.status(409).json({ error: 'このメールアドレスは既に登録済みです' });

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間後
  const inv = await one(
    `INSERT INTO invitations (email, name, role, token, expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [email, name || '', role, token, expiresAt, getUserId(req)]
  );
  const inviteUrl = `${baseUrl(req)}/accept-invite.html?token=${token}`;

  let emailSent = false, emailError = null;
  try {
    await makeTransporter().sendMail({
      from: process.env.MAIL_FROM || 'CONSTRUCT_PRO <noreply@construct-pro.jp>',
      to: email,
      subject: '【株式会社WIN WIN】アカウント発行のご案内',
      text: `${name || 'ご担当者'} 様\n\nお世話になっております。株式会社WIN WINでございます。\nこのたび、業務管理システムのアカウントを発行いたしましたのでご案内申し上げます。\n\n　権限：${INVITE_ROLES[role]}\n\n下記URLよりパスワードをご設定のうえ、ログインをお願いいたします。\n${inviteUrl}\n\n※本URLの有効期限は発行から24時間です。期限を過ぎた場合は、お手数ですが管理者まで再発行をご依頼ください。\n\n本メールにお心当たりのない場合は、破棄いただきますようお願い申し上げます。\n\n──────────────────\n株式会社WIN WIN\n〒604-0924 京都市中京区一之船入町537-20 FIS御池ビル505号\nTEL：075-777-1236\n──────────────────`,
    });
    emailSent = true;
  } catch (e) {
    emailError = e.message;
    console.error('invite mail failed:', e.message);
  }
  await logAudit(getUserId(req), 'CREATE', 'invitations', inv.id, {
    name: email, changes: [`アカウント招待を発行（権限: ${INVITE_ROLES[role]}／24時間有効）`],
  });
  res.json({ id: inv.id, inviteUrl, expiresAt, emailSent, emailError });
}));

// 招待を取り消し
app.delete('/api/invitations/:id', authMiddleware, h(async (req, res) => {
  await ensureAux();
  const inv = await one('SELECT * FROM invitations WHERE id=$1', [req.params.id]);
  await q('DELETE FROM invitations WHERE id=$1', [req.params.id]);
  await logAudit(getUserId(req), 'DELETE', 'invitations', parseInt(req.params.id), {
    name: inv ? inv.email : `#${req.params.id}`, changes: ['アカウント招待を取り消し'],
  });
  res.json({ success: true });
}));

// 招待トークン検証（accept-invite ページから／認証不要）
app.get('/api/invitations/validate', h(async (req, res) => {
  await ensureAux();
  const inv = await one('SELECT * FROM invitations WHERE token=$1', [req.query.token]);
  if (!inv) return res.json({ valid: false, reason: 'not_found' });
  if (inv.accepted_at) return res.json({ valid: false, reason: 'accepted' });
  if (new Date(inv.expires_at) < new Date()) return res.json({ valid: false, reason: 'expired' });
  res.json({ valid: true, email: inv.email, name: inv.name, role: inv.role, roleLabel: INVITE_ROLES[inv.role] || inv.role });
}));

// 招待を受諾してアカウント作成（パスワード設定／認証不要）
app.post('/api/invitations/accept', h(async (req, res) => {
  await ensureAux();
  const { token, password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'パスワードは8文字以上で設定してください' });
  const inv = await one('SELECT * FROM invitations WHERE token=$1', [token]);
  if (!inv) return res.status(404).json({ error: '招待が見つかりません' });
  if (inv.accepted_at) return res.status(409).json({ error: 'この招待は既に使用されています' });
  if (new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: '招待リンクの有効期限（24時間）が切れています。管理者へ再発行をご依頼ください' });
  const dup = await one('SELECT id FROM users WHERE email=$1', [inv.email]);
  if (dup) return res.status(409).json({ error: 'このメールアドレスは既に登録済みです' });

  const hash = await bcrypt.hash(password, 10);
  const user = await one(
    'INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id,email,name,role',
    [inv.email, hash, inv.name || '', inv.role]
  );
  await q('UPDATE invitations SET accepted_at=current_timestamp WHERE id=$1', [inv.id]);
  await logAudit(user.id, 'CREATE', 'users', user.id, { name: user.email, changes: [`招待からアカウント登録（権限: ${INVITE_ROLES[inv.role] || inv.role}）`] });
  const jwtToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token: jwtToken, user });
}));

// ローカル実行時のみ listen（Vercel ではモジュールとして読み込まれる）
if (require.main === module) {
  const PORT = parseInt(process.env.PORT || '4500', 10);
  app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
}

module.exports = app;
