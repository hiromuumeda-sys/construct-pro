const express = require('express');
const cors = require('cors');
const path = require('path');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { q, one } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
// デモは頻繁に更新するため静的ファイルはキャッシュさせない
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store, must-revalidate'),
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
  orders:     { category:'工事区分', vendor:'発注先', estimate:'見積額', planned:'予算額', decided:'確定額', status:'ステータス', details:'内容', site:'現場', period_start:'開始', period_end:'終了', handover:'引渡', paymentStatus:'支払状況', paymentMethod:'支払方法', paymentDate:'支払日', paymentNotes:'支払備考' },
  vendors:    { company:'会社名', dept:'部署', contact:'担当者', email:'メール', phone:'電話', address:'住所', categories:'工事区分' },
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
  res.json(await q('SELECT * FROM vendors ORDER BY id'));
}));

app.post('/api/vendors', h(async (req, res) => {
  const { company, dept, contact, email, phone, address, categories } = req.body;
  const row = await one('SELECT COALESCE(MAX(id::int),0) AS max FROM vendors');
  const newId = String(Number(row.max) + 1).padStart(3, '0');
  await q('INSERT INTO vendors (id, company, dept, contact, email, phone, address, categories) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [newId, company, dept, contact, email, phone, address, categories || '']);
  const userId = getUserId(req);
  await logAudit(userId, 'CREATE', 'vendors', newId, { name: company, changes: [`新規登録（発注先: ${company || '-'}）`] });
  res.json({ id: newId, ...req.body });
}));

app.put('/api/vendors/:id', h(async (req, res) => {
  const { company, dept, contact, email, phone, address, categories } = req.body;
  const before = await one('SELECT * FROM vendors WHERE id=$1', [req.params.id]);
  await q('UPDATE vendors SET company=$1, dept=$2, contact=$3, email=$4, phone=$5, address=$6, categories=$7 WHERE id=$8',
    [company, dept, contact, email, phone, address, categories ?? before?.categories ?? '', req.params.id]);
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
const ORDER_COLS = 'project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment, "paymentStatus", "paymentMethod", "paymentDate", "paymentNotes"';

app.get('/api/orders', h(async (req, res) => {
  res.json(await q('SELECT * FROM orders ORDER BY id'));
}));

app.post('/api/orders', h(async (req, res) => {
  const b = req.body;
  const ins = await one(
    `INSERT INTO orders (${ORDER_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [b.project_id, b.category, b.vendor, b.estimate, b.planned, b.decided, b.status, b.details, b.site, b.period_start, b.period_end, b.handover, b.payment, b.paymentStatus || '未払い', b.paymentMethod || '', b.paymentDate || '', b.paymentNotes || '']
  );
  const userId = getUserId(req);
  await logAudit(userId, 'CREATE', 'orders', ins.id, { name: `${b.category || ''}（${b.vendor || ''}）`, changes: [`新規登録（工事区分: ${b.category || '-'} / 発注先: ${b.vendor || '-'}）`] });
  res.json({ id: ins.id, ...b });
}));

app.put('/api/orders/:id', h(async (req, res) => {
  const b = req.body;
  const before = await one('SELECT * FROM orders WHERE id=$1', [req.params.id]);
  await q(
    `UPDATE orders SET project_id=$1, category=$2, vendor=$3, estimate=$4, planned=$5, decided=$6, status=$7, details=$8, site=$9, period_start=$10, period_end=$11, handover=$12, payment=$13, "paymentStatus"=$14, "paymentMethod"=$15, "paymentDate"=$16, "paymentNotes"=$17 WHERE id=$18`,
    [b.project_id, b.category, b.vendor, b.estimate, b.planned, b.decided, b.status, b.details, b.site, b.period_start, b.period_end, b.handover, b.payment, b.paymentStatus, b.paymentMethod, b.paymentDate, b.paymentNotes, req.params.id]
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

// ============ Customers API ============
app.get('/api/customers', h(async (req, res) => {
  res.json(await q('SELECT * FROM customers ORDER BY id'));
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
  const { project_id, received_date, amount, month, memo } = req.body;
  const ins = await one('INSERT INTO receipts (project_id, received_date, amount, month, memo) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [project_id, received_date, amount, month, memo]);
  const userId = getUserId(req);
  await logAudit(userId, 'CREATE', 'receipts', ins.id, { name: month, changes: [`新規登録（${month || '-'} / ${fmtVal(amount)}円）`] });
  res.json({ id: ins.id, ...req.body });
}));

app.put('/api/receipts/:id', h(async (req, res) => {
  const { project_id, received_date, amount, month, memo } = req.body;
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
  const sample = ['WW7-0001,2026-06-30,5000000,6月,着手金', 'WW7-0003,2026-06-30,3000000,6月,中間金'].join('\n');
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
    await q('INSERT INTO receipts (project_id, received_date, amount, month, memo) VALUES ($1,$2,$3,$4,$5)', [project.id, date, amount, month || '', memo || '']);
    imported++;
  }
  res.json({ imported, errors, total: dataLines.length });
}));

// 売上サマリ
app.get('/api/sales-summary', h(async (req, res) => {
  const projects = await q('SELECT * FROM projects ORDER BY id');
  const summary = [];
  for (const p of projects) {
    const r = await one('SELECT COALESCE(SUM(amount),0) AS total FROM receipts WHERE project_id=$1', [p.id]);
    const received = Number(r.total) || 0;
    const contract = Number(p.amount) || 0;
    let payStatus = '未入金';
    if (contract > 0 && received >= contract) payStatus = '入金済';
    else if (received > 0) payStatus = '一部入金';
    const inv = await one('SELECT due_date FROM invoices WHERE project_id=$1 ORDER BY id DESC LIMIT 1', [p.id]);
    summary.push({ id: p.id, project_no: p.project_no, name: p.name, client: p.client, contract_amount: contract, received_amount: received, outstanding: contract - received, pay_status: payStatus, due_date: inv ? inv.due_date : null, status: p.status });
  }
  res.json(summary);
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
    if (d < 0) notifications.push({ type: 'payment', level: 'error', icon: 'error', title: '支払期日超過', message: `${o.vendor} への支払（${o.category}）が${Math.abs(d)}日超過しています`, date: o.paymentDate });
    else if (d <= 7) notifications.push({ type: 'payment', level: 'warning', icon: 'schedule', title: '支払期日接近', message: `${o.vendor} への支払（${o.category}）まであと${d}日です`, date: o.paymentDate });
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
    if (d < 0) notifications.push({ type: 'receipt', level: 'error', icon: 'error', title: '入金期日超過（未入金）', message: `${project ? project.name : '案件'}（${inv.invoice_no}）の入金期日が${Math.abs(d)}日超過・未入金残 ${yen}`, date: inv.due_date });
    else if (d <= 7) notifications.push({ type: 'receipt', level: 'warning', icon: 'schedule', title: '入金期日接近', message: `${project ? project.name : '案件'}（${inv.invoice_no}）の入金期日まであと${d}日・未入金残 ${yen}`, date: inv.due_date });
  }

  const wonProjects = await q("SELECT * FROM projects WHERE status = '受注'");
  for (const p of wonProjects) {
    const c = await one('SELECT COUNT(*) AS cnt FROM invoices WHERE project_id=$1', [p.id]);
    if (Number(c.cnt) === 0) notifications.push({ type: 'missing', level: 'info', icon: 'description', title: '請求書未発行', message: `${p.name} は受注済みですが請求書が未発行です`, date: null });
  }

  const undelivered = await q("SELECT * FROM orders WHERE status NOT IN ('発注完了', '支払済み') AND decided > 0");
  if (undelivered.length > 0) notifications.push({ type: 'missing', level: 'info', icon: 'receipt_long', title: '注文書未発行', message: `決定済みで注文書未発行の明細が${undelivered.length}件あります`, date: null });

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
  demoNotifications.forEach(n => notifications.push({ type: 'demo', ...n }));

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
    csv = toCSV(rows, [{ key: 'received_date', label: '入金日' }, { key: 'project_no', label: '工番' }, { key: 'project_name', label: '工事名' }, { key: 'amount', label: '入金額' }, { key: 'month', label: '対象月度' }, { key: 'memo', label: '備考' }]);
    filename = 'receipts.csv';
  } else if (type === 'payments') {
    const rows = await q('SELECT o.*, p.name AS project_name, p.project_no FROM orders o LEFT JOIN projects p ON o.project_id = p.id ORDER BY o.id');
    csv = toCSV(rows, [{ key: 'project_no', label: '工番' }, { key: 'project_name', label: '工事名' }, { key: 'vendor', label: '支払先' }, { key: 'category', label: '支払内容' }, { key: 'decided', label: '金額' }, { key: 'paymentMethod', label: '支払方法' }, { key: 'paymentDate', label: '支払期日' }, { key: 'paymentStatus', label: 'ステータス' }]);
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
  const thisMonthPayments = orders.filter(o => o.paymentStatus !== '支払済み' && o.paymentDate && o.paymentDate.startsWith(ym)).reduce((s, o) => s + (Number(o.decided) || 0), 0);
  const thisMonthReceipts = receipts.filter(r => r.received_date && r.received_date.startsWith(ym)).reduce((s, r) => s + (Number(r.amount) || 0), 0);

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

  res.json({ month: ym, activeCount: projects.length, totalReceivable, totalPayable, thisMonthReceipts, thisMonthPayments, totalRevenue, totalCost, totalProfit, avgMargin, projectProfit: projectProfit.sort((a, b) => b.revenue - a.revenue) });
}));

// ============ Cache endpoint ============
app.get('/api/cache', h(async (req, res) => {
  const [projects, vendors, categories, orders, customers, receipts, invoices] = await Promise.all([
    q('SELECT * FROM projects ORDER BY id'),
    q('SELECT * FROM vendors ORDER BY id'),
    q('SELECT * FROM categories ORDER BY "order"'),
    q('SELECT * FROM orders ORDER BY id'),
    q('SELECT * FROM customers ORDER BY id'),
    q('SELECT * FROM receipts ORDER BY received_date DESC'),
    q('SELECT * FROM invoices ORDER BY id DESC'),
  ]);
  res.json({ projects, vendors, categories, orders, customers, receipts, invoices });
}));

app.get('/api/test', (req, res) => res.json({ status: 'ok', message: 'Server is running' }));

// ============ PDF: 請求書 ============
function buildInvoicePDF(project, orders) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const purpleColor = '#8B4789';
    const pageWidth = doc.page.width;
    doc.rect(0, 0, pageWidth, 100).fill(purpleColor);
    doc.fontSize(40).font('Helvetica-Bold').fillColor('white');
    doc.text('請　求　書', 50, 30);
    doc.fillColor('black').fontSize(10);
    doc.text(`${project.clientCompany || '-'}`, 50, 130);
    doc.text('件名：', 50, 150);
    doc.text(project.name, 80, 150, { width: 200 });
    const totalAmount = orders.reduce((sum, o) => sum + (Number(o.decided) || 0), 0);
    const now = new Date();
    doc.text(`合計金額: ¥${totalAmount.toLocaleString()}`, 50, 200);
    doc.text(`請求日: ${now.toLocaleDateString('ja-JP')}`, 50, 220);
    const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    doc.text(`お支払期限: ${dueDate.toLocaleDateString('ja-JP')}`, 50, 240);
    doc.fontSize(9);
    doc.text('株式会社WIN WIN', 380, 130);
    doc.text('〒604-0924', 380, 145);
    doc.text('京都市中京区一之船入町537-20', 380, 158);
    doc.text('FIS御池ビル505号', 380, 171);
    doc.text('TEL : 075-777-1236', 380, 190);
    doc.text(`請求№: INV-${String(project.id).padStart(5, '0')}`, 380, 220);
    doc.text('適格請求書発行事業者登録番号: T8130001068355', 380, 235);
    const tableTop = 290;
    doc.rect(50, tableTop, pageWidth - 100, 25).fill(purpleColor);
    doc.fillColor('white').fontSize(9);
    const colPositions = [60, 150, 210, 280, 350, 420];
    ['品名', '数量', '単位', '単価', '金額', '摘要'].forEach((label, i) => doc.text(label, colPositions[i], tableTop + 8));
    let tableRowY = tableTop + 30;
    doc.fillColor('black').fontSize(8);
    orders.forEach(order => {
      if (tableRowY > 700) { doc.addPage(); tableRowY = 50; }
      doc.text(order.category || '-', colPositions[0], tableRowY);
      doc.text('1', colPositions[1], tableRowY);
      doc.text('式', colPositions[2], tableRowY);
      doc.text(`¥${(Number(order.decided) || 0).toLocaleString()}`, colPositions[3], tableRowY);
      doc.text(`¥${(Number(order.decided) || 0).toLocaleString()}`, colPositions[4], tableRowY);
      tableRowY += 20;
    });
    const calcY = tableRowY + 20;
    const tax = Math.floor(totalAmount * 0.1);
    const total = totalAmount + tax;
    doc.fontSize(9);
    doc.text('小　　計:', 300, calcY);
    doc.text(`¥${totalAmount.toLocaleString()}`, 450, calcY, { align: 'right', width: 80 });
    doc.text('税率:', 300, calcY + 20);
    doc.text('10%', 450, calcY + 20, { align: 'right', width: 80 });
    doc.text('消費税:', 300, calcY + 40);
    doc.text(`¥${tax.toLocaleString()}`, 450, calcY + 40, { align: 'right', width: 80 });
    doc.font('Helvetica-Bold').text('合　　計:', 300, calcY + 60);
    doc.text(`¥${total.toLocaleString()}`, 450, calcY + 60, { align: 'right', width: 80 });
    doc.font('Helvetica').fontSize(9);
    doc.text('[振込先] 〇〇銀行 京都支店', 50, calcY + 120);
    doc.text('口座番号／(普)0777777', 50, calcY + 140);
    doc.end();
  });
}

// ============ PDF: 発注書 ============
function buildPurchaseOrderPDF(order, project, vendor) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const primaryColor = '#1a1d3d';
    const pageWidth = doc.page.width;
    const amount = Number(order.decided || order.planned || order.estimate) || 0;
    const tax = Math.floor(amount * 0.1);
    const total = amount + tax;
    doc.rect(0, 0, pageWidth, 100).fill(primaryColor);
    doc.fontSize(40).font('Helvetica-Bold').fillColor('white');
    doc.text('発　注　書', 50, 30);
    doc.fillColor('black').fontSize(11);
    doc.text(`${order.vendor || '-'} 御中`, 50, 130);
    doc.fontSize(9);
    doc.text('株式会社WIN WIN', 380, 125);
    doc.text('〒604-0924', 380, 140);
    doc.text('京都市中京区一之船入町537-20', 380, 153);
    doc.text('FIS御池ビル505号', 380, 166);
    doc.text('TEL : 075-777-1236', 380, 185);
    const now = new Date();
    doc.text(`発注№: PO-${String(order.id).padStart(5, '0')}`, 380, 205);
    doc.text(`発注日: ${now.toLocaleDateString('ja-JP')}`, 380, 220);
    const amountTop = 250;
    doc.rect(50, amountTop, pageWidth - 100, 30).fill(primaryColor);
    doc.fillColor('white').fontSize(11).font('Helvetica-Bold');
    doc.text('発注金額合計 (税込)', 60, amountTop + 9);
    doc.text(`¥${total.toLocaleString()}-`, 350, amountTop + 9, { align: 'right', width: 165 });
    doc.fillColor('black').font('Helvetica').fontSize(9);
    let infoY = amountTop + 50;
    const info = [
      ['工事名', project ? project.name : (order.details || '-')],
      ['工事場所', order.site || '-'],
      ['工事期間', (order.period_start && order.period_end) ? `${order.period_start} 〜 ${order.period_end}` : '-'],
      ['検査・引渡時期', order.handover || '-'],
      ['支払条件', order.payment || '-'],
      ['工事内容', order.details || '-'],
    ];
    info.forEach(([label, val]) => {
      doc.font('Helvetica-Bold').fillColor('#666').text(label, 60, infoY, { width: 110 });
      doc.font('Helvetica').fillColor('black').text(String(val), 175, infoY, { width: 340 });
      infoY += 24;
    });
    const tableTop = infoY + 20;
    doc.rect(50, tableTop, pageWidth - 100, 25).fill(primaryColor);
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
    doc.text('内容・品名', 60, tableTop + 8);
    doc.text('金額 (税抜)', 350, tableTop + 8, { align: 'right', width: 165 });
    let rowY = tableTop + 32;
    doc.fillColor('black').font('Helvetica').fontSize(9);
    doc.text(order.category || '一式', 60, rowY);
    doc.text(`¥${amount.toLocaleString()}`, 350, rowY, { align: 'right', width: 165 });
    const calcY = rowY + 40;
    doc.text('小　　計:', 320, calcY);
    doc.text(`¥${amount.toLocaleString()}`, 435, calcY, { align: 'right', width: 80 });
    doc.text('消費税(10%):', 320, calcY + 20);
    doc.text(`¥${tax.toLocaleString()}`, 435, calcY + 20, { align: 'right', width: 80 });
    doc.font('Helvetica-Bold').text('合　　計:', 320, calcY + 40);
    doc.text(`¥${total.toLocaleString()}`, 435, calcY + 40, { align: 'right', width: 80 });
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    doc.text('備考：本発注書の内容に基づき、指定の期日までに施工をお願いいたします。', 50, calcY + 90);
    doc.end();
  });
}

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

// ローカル実行時のみ listen（Vercel ではモジュールとして読み込まれる）
if (require.main === module) {
  const PORT = parseInt(process.env.PORT || '4500', 10);
  app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
}

module.exports = app;
