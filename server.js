const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

const app = express();
const db = new Database('construct.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'projects.html'));
});

// Initialize DB
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      client TEXT NOT NULL,
      clientCompany TEXT,
      clientPhone TEXT,
      clientEmail TEXT,
      clientAddress TEXT,
      amount INTEGER,
      startDate TEXT,
      endDate TEXT,
      status TEXT,
      notes TEXT,
      paid INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      dept TEXT,
      contact TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      area TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      "order" INTEGER,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      project_id INTEGER,
      category TEXT,
      vendor TEXT,
      estimate INTEGER,
      planned INTEGER,
      decided INTEGER,
      status TEXT,
      details TEXT,
      site TEXT,
      period_start TEXT,
      period_end TEXT,
      handover TEXT,
      payment TEXT,
      paymentStatus TEXT DEFAULT '未払い',
      paymentMethod TEXT,
      paymentDate TEXT,
      paymentNotes TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY,
      company TEXT NOT NULL,
      department TEXT,
      contact TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT
    );
  `);

  // Check if data exists
  const projectCount = db.prepare('SELECT COUNT(*) as cnt FROM projects').get().cnt;
  const customerCount = db.prepare('SELECT COUNT(*) as cnt FROM customers').get().cnt;
  if (projectCount === 0 || customerCount === 0) {
    const projects = [
      { name: '京都御所南マンション改修工事', client: '京都工務店', clientCompany: '(株)京都工務', clientPhone: '075-123-4567', clientEmail: 'contact@kyoto-koumuten.jp', clientAddress: '京都府京都市中京区', amount: 12500000, startDate: '2024/05/10', endDate: '2025/03/31', status: '未対応', notes: '要現場説明会参加。図面承認待ち。' },
      { name: '中京区三条通オフィスビル新築工事', client: '滋賀設備工事', clientCompany: '滋賀設備工事(株)', clientPhone: '077-567-8901', clientEmail: 'info@shiga-setubi.co.jp', clientAddress: '滋賀県大津市', amount: 4800000, startDate: '2024/06/01', endDate: '2024/08/30', status: '提案中', notes: '概算見積提出済み。' },
      { name: '下鴨神社周辺戸建住宅リノベーション', client: '大阪内装クリエイト', clientCompany: '大阪内装(株)', clientPhone: '06-234-5678', clientEmail: 'sales@osaka-naikusou.jp', clientAddress: '大阪府大阪市北区', amount: 28340000, startDate: '2024/07/20', endDate: '2024/12/15', status: '見積確認中', notes: '資材高騰による再見積依頼あり。' },
      { name: '烏丸御池メディカルモール内装工事', client: '奈良建具製作所', clientCompany: '(株)奈良建具', clientPhone: '0742-789-0123', clientEmail: 'nara@tategu.jp', clientAddress: '奈良県奈良市', amount: 8500000, startDate: '2024/04/01', endDate: '2025/03/31', status: '受注', notes: '契約締結済み。' },
      { name: '嵐山旅館客室改修工事', client: '京都工務店', clientCompany: '(株)京都工務', clientPhone: '075-123-4567', clientEmail: 'contact@kyoto-koumuten.jp', clientAddress: '京都府京都市中京区', amount: 45000000, startDate: '2024/05/01', endDate: '2024/09/30', status: '失注', notes: '価格競争力により失注。' },
      { name: '丹波黒豆工場改築工事', client: '兵庫建設', clientCompany: '兵庫建設(株)', clientPhone: '079-345-6789', clientEmail: 'hyogo@kensetsu.jp', clientAddress: '兵庫県丹波市', amount: 18900000, startDate: '2024/08/15', endDate: '2025/06/30', status: '受注', notes: '地元企業との協業案件。' },
      { name: '福知山駅前商業施設新築', client: '福知山市役所', clientCompany: '福知山市役所', clientPhone: '0773-901-2345', clientEmail: 'projects@fukuchiyama.jp', clientAddress: '京都府福知山市', amount: 52000000, startDate: '2024/09/01', endDate: '2025/12/31', status: '提案中', notes: '公共事業。入札予定。' },
      { name: '伏見港湾倉庫拡張工事', client: 'トランスポート関西', clientCompany: 'トランスポート関西(株)', clientPhone: '075-456-7890', clientEmail: 'kowan@transport-kansai.jp', clientAddress: '京都府京都市伏見区', amount: 16200000, startDate: '2024/10/01', endDate: '2025/05/15', status: '見積確認中', notes: '急工程での完成要望あり。' },
      { name: '長岡京医療施設増築工事', client: '日本赤十字', clientCompany: '日本赤十字社', clientPhone: '075-567-8901', clientEmail: 'medical@jrc.or.jp', clientAddress: '京都府長岡京市', amount: 35000000, startDate: '2024/07/01', endDate: '2025/08/30', status: '未対応', notes: '設計図面まだ未確定。' },
      { name: '南丹市庁舎耐震補強工事', client: '南丹市役所', clientCompany: '南丹市役所', clientPhone: '0771-678-9012', clientEmail: 'kenchiku@nantan.jp', clientAddress: '京都府南丹市', amount: 24500000, startDate: '2024/11/01', endDate: '2025/09/30', status: '受注', notes: '施工実績が必要な物件。' },
    ];
    const insertProject = db.prepare('INSERT INTO projects (name, client, clientCompany, clientPhone, clientEmail, clientAddress, amount, startDate, endDate, status, notes, paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    projects.forEach(p => insertProject.run(p.name, p.client, p.clientCompany, p.clientPhone, p.clientEmail, p.clientAddress, p.amount, p.startDate, p.endDate, p.status, p.notes, 0));

    const vendors = [
      { id: '001', company: 'なにわ建設株式会社', dept: '建築部', contact: '田中 一郎', email: 'i.tanaka@naniwa-con.co.jp', phone: '06-6123-4567', address: '大阪府大阪市北区梅田', area: '大阪府' },
      { id: '002', company: '京都冷熱工業所', dept: '施工課', contact: '山口 慎二', email: 's.yamaguchi@kyoto-reinet.jp', phone: '075-341-8899', address: '京都府京都市下京区烏丸通', area: '京都府' },
      { id: '003', company: '播磨土木エンジニアリング', dept: '土木課', contact: '藤本 剛', email: 't.fujimoto@harima-eng.com', phone: '078-234-5678', address: '兵庫県姫路市飾磨区', area: '兵庫県' },
      { id: '004', company: '関西電設工業', dept: '電気工事部', contact: '佐藤 太郎', email: 'taro.sato@kansai-densetsu.co.jp', phone: '077-512-3456', address: '滋賀県大津市中央', area: '滋賀県' },
      { id: '005', company: '大阪内装クリエイト', dept: '内装設計課', contact: '山田 花子', email: 'hanako.yamada@osaka-insou.co.jp', phone: '06-6789-0123', address: '大阪府大阪市中央区', area: '大阪府' },
      { id: '006', company: '京都建具製作所', dept: '製造部', contact: '鈴木 次郎', email: 'jiro.suzuki@kyoto-tategu.co.jp', phone: '075-623-4567', address: '京都府京都市伏見区', area: '京都府' },
      { id: '007', company: '奈良建材商社', dept: '営業部', contact: '伊藤 花美', email: 'hanami.ito@nara-kenzai.co.jp', phone: '0742-34-5678', address: '奈良県奈良市二条', area: '奈良県' },
      { id: '008', company: 'トランスポート関西', dept: '施設管理課', contact: '田中 美咲', email: 'misaki.tanaka@transport-kansai.co.jp', phone: '078-901-2345', address: '兵庫県神戸市中央区', area: '兵庫県' },
      { id: '009', company: '日本赤十字施設部', dept: '施設建設課', contact: '鈴木 敏夫', email: 'toshio.suzuki@jrc-facility.jp', phone: '03-1234-5678', address: '京都府京都市上京区', area: '京都府' },
      { id: '010', company: '関西環境施工', dept: '工事部', contact: '高橋 健一', email: 'kenichi.takahashi@kankyo-sekkou.co.jp', phone: '06-5432-1098', address: '大阪府堺市中区', area: '大阪府' },
    ];
    const insertVendor = db.prepare('INSERT INTO vendors (id, company, dept, contact, email, phone, address, area) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    vendors.forEach(v => insertVendor.run(v.id, v.company, v.dept, v.contact, v.email, v.phone, v.address, v.area));

    const categories = [
      { name: '仮設工事', order: 1, note: '共通仮設、直接仮設。' },
      { name: '土工事・地盤改良', order: 2, note: '京都盆地特有の粘土層対応。' },
      { name: '基礎工事', order: 3, note: 'RC造基礎、杭打ち工事。' },
      { name: '躯体工事', order: 4, note: 'SRC造、RC造躯体。' },
      { name: '屋根工事', order: 5, note: 'アスファルト、金属屋根。' },
      { name: '建具工事', order: 6, note: 'サッシ、ドア、建具取付。' },
      { name: '内装工事', order: 7, note: 'クロス、床、天井仕上。' },
      { name: '電気設備工事', order: 8, note: '配線、照明、受変電。' },
      { name: '給排水衛生工事', order: 9, note: '給水配管、排水管、衛生器具。' },
      { name: '空調設備工事', order: 10, note: 'エアコン、換気設備。' },
    ];
    const insertCategory = db.prepare('INSERT INTO categories (code, name, "order", note) VALUES (?, ?, ?, ?)');
    categories.forEach((c, i) => {
      const code = String(i + 1).padStart(5, '0');
      insertCategory.run(code, c.name, c.order, c.note);
    });

    const orders = [
      { project_id: 1, category: '仮設工事', vendor: 'なにわ建設株式会社', estimate: 2500000, planned: 2300000, decided: 2200000, status: '決定済み', details: '仮設工事一式', site: '京都四条烏丸店舗', period_start: '2024-04-06', period_end: '2024-05-08', handover: '2024-05-31', payment: '引き渡し月月末締め翌々月5日振込', paymentStatus: '支払済み', paymentMethod: '銀行振込', paymentDate: '2024-07-05', paymentNotes: '' },
      { project_id: 1, category: '土工事・地盤改良', vendor: '播磨土木エンジニアリング', estimate: 3800000, planned: 3600000, decided: 3500000, status: '発注完了', details: '地盤調査及び改良工事', site: '京都四条烏丸店舗', period_start: '2024-04-06', period_end: '2024-05-08', handover: '2024-05-31', payment: '引き渡し月月末締め翌々月5日振込', paymentStatus: '支払済み', paymentMethod: '口座振替', paymentDate: '2024-07-05', paymentNotes: '' },
      { project_id: 2, category: '基礎工事', vendor: 'なにわ建設株式会社', estimate: 4200000, planned: 4000000, decided: 3900000, status: '決定済み', details: 'RC造基礎工事', site: '京都四条烏丸店舗', period_start: '2024-04-06', period_end: '2024-05-08', handover: '2024-05-31', payment: '引き渡し月月末締め翌々月5日振込', paymentStatus: '部分払い', paymentMethod: '銀行振込', paymentDate: '2024-07-05', paymentNotes: '5月支払い分済み' },
      { project_id: 2, category: '躯体工事', vendor: '京都冷熱工業所', estimate: 5600000, planned: 5400000, decided: null, status: '見積待ち', details: 'SRC造躯体工事', site: '京都四条烏丸店舗', period_start: '2024-04-06', period_end: '2024-05-08', handover: '2024-05-31', payment: '引き渡し月月末締め翌々月5日振込', paymentStatus: '未払い', paymentMethod: '', paymentDate: '', paymentNotes: '' },
      { project_id: 3, category: '屋根工事', vendor: '関西電設工業', estimate: 1800000, planned: 1700000, decided: 1650000, status: '発注完了', details: 'アスファルト防水屋根', site: '京都四条烏丸店舗', period_start: '2024-04-06', period_end: '2024-05-08', handover: '2024-05-31', payment: '引き渡し月月末締め翌々月5日振込', paymentStatus: '支払済み', paymentMethod: '現金', paymentDate: '2024-07-05', paymentNotes: '' },
      { project_id: 3, category: '建具工事', vendor: '京都建具製作所', estimate: 2400000, planned: 2300000, decided: 2250000, status: '決定済み', details: 'アルミサッシ取付', site: '京都四条烏丸店舗', period_start: '2024-04-06', period_end: '2024-05-08', handover: '2024-05-31', payment: '引き渡し月月末締め翌々月5日振込', paymentStatus: '支払済み', paymentMethod: '銀行振込', paymentDate: '2024-07-05', paymentNotes: '' },
      { project_id: 4, category: '内装工事', vendor: '大阪内装クリエイト', estimate: 3100000, planned: 2900000, decided: 2800000, status: '発注完了', details: 'クロス、床仕上工事', site: '京都四条烏丸店舗', period_start: '2024-04-06', period_end: '2024-05-08', handover: '2024-05-31', payment: '引き渡し月月末締め翌々月5日振込', paymentStatus: '支払済み', paymentMethod: '銀行振込', paymentDate: '2024-07-05', paymentNotes: '' },
      { project_id: 5, category: '電気設備工事', vendor: '関西電設工業', estimate: 2200000, planned: 2100000, decided: null, status: '未処理', details: '電気配線、照明工事', site: '京都四条烏丸店舗', period_start: '2024-04-06', period_end: '2024-05-08', handover: '2024-05-31', payment: '引き渡し月月末締め翌々月5日振込', paymentStatus: '未払い', paymentMethod: '', paymentDate: '', paymentNotes: '' },
      { project_id: 5, category: '給排水衛生工事', vendor: '京都冷熱工業所', estimate: 1900000, planned: 1800000, decided: 1750000, status: '決定済み', details: '給排水配管工事', site: '京都四条烏丸店舗', period_start: '2024-04-06', period_end: '2024-05-08', handover: '2024-05-31', payment: '引き渡し月月末締め翌々月5日振込', paymentStatus: '未払い', paymentMethod: '口座振替', paymentDate: '2024-07-05', paymentNotes: '' },
      { project_id: 6, category: '空調設備工事', vendor: '関西環境施工', estimate: 2800000, planned: 2600000, decided: 2500000, status: '見積待ち', details: '空調機器取付工事', site: '京都四条烏丸店舗', period_start: '2024-04-06', period_end: '2024-05-08', handover: '2024-05-31', payment: '引き渡し月月末締め翌々月5日振込', paymentStatus: '未払い', paymentMethod: '', paymentDate: '', paymentNotes: '' },
    ];
    const insertOrder = db.prepare('INSERT INTO orders (project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment, paymentStatus, paymentMethod, paymentDate, paymentNotes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    orders.forEach(o => insertOrder.run(o.project_id, o.category, o.vendor, o.estimate, o.planned, o.decided, o.status, o.details, o.site, o.period_start, o.period_end, o.handover, o.payment, o.paymentStatus, o.paymentMethod, o.paymentDate, o.paymentNotes));

    const customers = [
      { company: '(株)京都工務', department: '営業部', contact: '山田 太郎', email: 'contact@kyoto-koumuten.jp', phone: '075-123-4567', address: '京都府京都市中京区', notes: '老舗施工企業。品質重視。' },
      { company: '滋賀設備工事(株)', department: '工事部', contact: '田中 花子', email: 'info@shiga-setubi.co.jp', phone: '077-567-8901', address: '滋賀県大津市', notes: '設備工事専門。納期厳守。' },
      { company: '大阪内装(株)', department: '営業課', contact: '佐藤 次郎', email: 'sales@osaka-naikusou.jp', phone: '06-234-5678', address: '大阪府大阪市北区', notes: '内装デザイン力が強み。' },
      { company: '(株)奈良建具', department: '製造部', contact: '鈴木 美咲', email: 'nara@tategu.jp', phone: '0742-789-0123', address: '奈良県奈良市', notes: '建具製作納期は3週間。' },
      { company: '兵庫建設(株)', department: '営業部', contact: '山本 健太', email: 'hyogo@kensetsu.jp', phone: '079-345-6789', address: '兵庫県丹波市', notes: '地域密着型。親切。' },
      { company: '福知山市役所', department: '都市建設課', contact: '高橋 健一', email: 'projects@fukuchiyama.jp', phone: '0773-901-2345', address: '京都府福知山市', notes: '公共事業。予算厳格。入札対応。' },
      { company: 'トランスポート関西(株)', department: '施設部', contact: '伊藤 由美', email: 'kowan@transport-kansai.jp', phone: '075-456-7890', address: '京都府京都市伏見区', notes: '物流施設専門。急工程対応。' },
      { company: '日本赤十字社', department: '施設建設課', contact: '中村 誠一', email: 'medical@jrc.or.jp', phone: '075-567-8901', address: '京都府長岡京市', notes: '医療施設。安全性重視。機密情報厳禁。' },
      { company: '南丹市役所', department: '建設課', contact: '西田 美咲', email: 'kenchiku@nantan.jp', phone: '0771-678-9012', address: '京都府南丹市', notes: '耐震改修案件多。公共工事。' },
      { company: '関西電設工業(株)', department: '営業部', contact: '伊藤 太郎', email: 'info@kansai-densetsu.jp', phone: '077-512-3456', address: '滋賀県大津市中央', notes: '電気工事専門。技術力高い。' },
    ];
    const insertCustomer = db.prepare('INSERT INTO customers (company, department, contact, email, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
    customers.forEach(c => insertCustomer.run(c.company, c.department, c.contact, c.email, c.phone, c.address, c.notes));
  }
}

initDB();

// Projects API
app.get('/api/projects', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY id').all();
  res.json(projects);
});

app.post('/api/projects', (req, res) => {
  const { name, client, clientCompany, clientPhone, clientEmail, clientAddress, amount, startDate, endDate, status, notes } = req.body;
  const result = db.prepare('INSERT INTO projects (name, client, clientCompany, clientPhone, clientEmail, clientAddress, amount, startDate, endDate, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(name, client, clientCompany, clientPhone, clientEmail, clientAddress, amount, startDate, endDate, status, notes);
  res.json({ id: result.lastInsertRowid, ...req.body });
});

app.put('/api/projects/:id', (req, res) => {
  const { name, client, clientCompany, clientPhone, clientEmail, clientAddress, amount, startDate, endDate, status, notes, paid } = req.body;
  db.prepare('UPDATE projects SET name=?, client=?, clientCompany=?, clientPhone=?, clientEmail=?, clientAddress=?, amount=?, startDate=?, endDate=?, status=?, notes=?, paid=? WHERE id=?').run(name, client, clientCompany, clientPhone, clientEmail, clientAddress, amount, startDate, endDate, status, notes, paid ? 1 : 0, req.params.id);
  res.json({ id: req.params.id, ...req.body });
});

app.delete('/api/projects/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Vendors API
app.get('/api/vendors', (req, res) => {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY id').all();
  res.json(vendors);
});

app.post('/api/vendors', (req, res) => {
  const { company, dept, contact, email, phone, address } = req.body;
  const maxId = db.prepare('SELECT MAX(CAST(id AS INTEGER)) as max FROM vendors').get().max || 0;
  const newId = String(maxId + 1).padStart(3, '0');
  db.prepare('INSERT INTO vendors (id, company, dept, contact, email, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?)').run(newId, company, dept, contact, email, phone, address);
  res.json({ id: newId, ...req.body });
});

app.put('/api/vendors/:id', (req, res) => {
  const { company, dept, contact, email, phone, address } = req.body;
  db.prepare('UPDATE vendors SET company=?, dept=?, contact=?, email=?, phone=?, address=? WHERE id=?').run(company, dept, contact, email, phone, address, req.params.id);
  res.json({ id: req.params.id, ...req.body });
});

app.delete('/api/vendors/:id', (req, res) => {
  db.prepare('DELETE FROM vendors WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Categories API
app.get('/api/categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY "order"').all();
  res.json(categories);
});

app.post('/api/categories', (req, res) => {
  const { name, order, note } = req.body;
  const maxCodeRow = db.prepare('SELECT MAX(CAST(code AS INTEGER)) as max FROM categories').get();
  const maxCode = maxCodeRow?.max || 0;
  const code = String(maxCode + 1).padStart(5, '0');
  const result = db.prepare('INSERT INTO categories (code, name, "order", note) VALUES (?, ?, ?, ?)').run(code, name, order, note);
  res.json({ id: result.lastInsertRowid, code, name, order, note });
});

app.put('/api/categories/:id', (req, res) => {
  const { code, name, order, note } = req.body;
  db.prepare('UPDATE categories SET code=?, name=?, "order"=?, note=? WHERE id=?').run(code, name, order, note, req.params.id);
  res.json({ id: req.params.id, ...req.body });
});

app.delete('/api/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Orders API
app.get('/api/orders', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY id').all();
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const { project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment } = req.body;
  const result = db.prepare('INSERT INTO orders (project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment);
  res.json({ id: result.lastInsertRowid, ...req.body });
});

app.put('/api/orders/:id', (req, res) => {
  const { project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment, paymentStatus, paymentMethod, paymentDate, paymentNotes } = req.body;
  db.prepare('UPDATE orders SET project_id=?, category=?, vendor=?, estimate=?, planned=?, decided=?, status=?, details=?, site=?, period_start=?, period_end=?, handover=?, payment=?, paymentStatus=?, paymentMethod=?, paymentDate=?, paymentNotes=? WHERE id=?').run(project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment, paymentStatus, paymentMethod, paymentDate, paymentNotes, req.params.id);
  res.json({ id: req.params.id, ...req.body });
});

app.delete('/api/orders/:id', (req, res) => {
  db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Customers API
app.get('/api/customers', (req, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY id').all();
  res.json(customers);
});

app.post('/api/customers', (req, res) => {
  const { company, department, contact, email, phone, address, notes } = req.body;
  const result = db.prepare('INSERT INTO customers (company, department, contact, email, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(company, department, contact, email, phone, address, notes);
  res.json({ id: result.lastInsertRowid, ...req.body });
});

app.put('/api/customers/:id', (req, res) => {
  const { company, department, contact, email, phone, address, notes } = req.body;
  db.prepare('UPDATE customers SET company=?, department=?, contact=?, email=?, phone=?, address=?, notes=? WHERE id=?').run(company, department, contact, email, phone, address, notes, req.params.id);
  res.json({ id: req.params.id, ...req.body });
});

app.delete('/api/customers/:id', (req, res) => {
  db.prepare('DELETE FROM customers WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Cache endpoint - returns all data at once
app.get('/api/cache', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY id').all();
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY id').all();
  const categories = db.prepare('SELECT * FROM categories ORDER BY "order"').all();
  const orders = db.prepare('SELECT * FROM orders ORDER BY id').all();
  const customers = db.prepare('SELECT * FROM customers ORDER BY id').all();
  res.json({ projects, vendors, categories, orders, customers });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Invoice API - Project invoice (all orders)
app.get('/api/invoice/project/:projectId', (req, res) => {
  try {
    console.log('Invoice request for project:', req.params.projectId);
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.projectId);
    console.log('Project found:', project);
    if(!project) return res.status(404).json({ error: 'Project not found' });

    const orders = db.prepare('SELECT * FROM orders WHERE project_id=?').all(req.params.projectId);
    console.log('Orders found:', orders.length);

  const doc = new PDFDocument({ margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${project.id}.pdf"`);

  doc.pipe(res);

  const purpleColor = '#8B4789';
  const pageWidth = doc.page.width;

  // Header background
  doc.rect(0, 0, pageWidth, 100).fill(purpleColor);

  // Title
  doc.fontSize(40).font('Helvetica-Bold').fillColor('white');
  doc.text('請　求　書', 50, 30);

  // Left panel
  doc.fillColor('black').fontSize(10);
  doc.text(`${project.clientCompany || '-'}`, 50, 130);
  doc.text('件名：', 50, 150);
  doc.text(project.name, 80, 150, { width: 200 });

  // Calculate total
  const totalAmount = orders.reduce((sum, o) => sum + (o.decided || 0), 0);
  doc.text(`合計金額: ¥${totalAmount.toLocaleString()}`, 50, 200);
  doc.text(`請求日: ${new Date().toLocaleDateString('ja-JP')}`, 50, 220);
  doc.text(`お支払期限: ${new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString('ja-JP')}`, 50, 240);

  // Right panel - Company info
  doc.fontSize(9);
  doc.text('株式会社WIN WIN', 380, 130);
  doc.text('〒604-0924', 380, 145);
  doc.text('京都市中京区一之船入町537-20', 380, 158);
  doc.text('FIS御池ビル505号', 380, 171);
  doc.text('TEL : 075-777-1236', 380, 190);

  // Invoice info
  doc.fontSize(9);
  doc.text(`請求№: INV-${project.id}`, 380, 220);
  doc.text(`適格請求書発行事業者登録番号: T8130001068355`, 380, 235);

  // Table header
  const tableTop = 290;
  doc.rect(50, tableTop, pageWidth - 100, 25).fill(purpleColor);

  doc.fillColor('white').fontSize(9);
  const colPositions = [60, 150, 210, 280, 350, 420];
  const colLabels = ['品名', '数量', '単位', '単価', '金額', '摘要'];
  colLabels.forEach((label, i) => {
    doc.text(label, colPositions[i], tableTop + 8);
  });

  // Table rows
  let tableRowY = tableTop + 30;
  doc.fillColor('black').fontSize(8);

  orders.forEach((order, idx) => {
    if(tableRowY > 700) {
      doc.addPage();
      tableRowY = 50;
    }
    doc.text(order.category || '-', colPositions[0], tableRowY);
    doc.text('1', colPositions[1], tableRowY);
    doc.text('式', colPositions[2], tableRowY);
    doc.text(`¥${(order.decided || 0).toLocaleString()}`, colPositions[3], tableRowY);
    doc.text(`¥${(order.decided || 0).toLocaleString()}`, colPositions[4], tableRowY);
    tableRowY += 20;
  });

  // Calculations
  const calcY = tableRowY + 20;
  doc.fontSize(9);
  doc.text('小　　計:', 300, calcY);
  doc.text(`¥${totalAmount.toLocaleString()}`, 450, calcY, { align: 'right', width: 80 });

  doc.text('税率:', 300, calcY + 20);
  doc.text('10%', 450, calcY + 20, { align: 'right', width: 80 });

  const tax = Math.floor(totalAmount * 0.1);
  doc.text('消費税:', 300, calcY + 40);
  doc.text(`¥${tax.toLocaleString()}`, 450, calcY + 40, { align: 'right', width: 80 });

  const total = totalAmount + tax;
  doc.font('Helvetica-Bold').text('合　　計:', 300, calcY + 60);
  doc.text(`¥${total.toLocaleString()}`, 450, calcY + 60, { align: 'right', width: 80 });

    // Bank info
    doc.font('Helvetica').fontSize(9);
    doc.text('[振込先] 〇〇銀行 京都支店', 50, calcY + 120);
    doc.text('口座番号／(普)0777777', 50, calcY + 140);

    doc.end();
  } catch(err) {
    console.error('Invoice generation error:', err);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
