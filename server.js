const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

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
      amount INTEGER,
      startDate TEXT,
      endDate TEXT,
      status TEXT,
      notes TEXT
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
      payment TEXT
    );
  `);

  // Check if data exists
  const count = db.prepare('SELECT COUNT(*) as cnt FROM projects').get().cnt;
  if (count === 0) {
    const projects = [
      { name: '京都御所南マンション改修工事', client: '京都工務店', amount: 12500000, startDate: '2024/05/10', endDate: '2025/03/31', status: '未対応', notes: '要現場説明会参加。図面承認待ち。' },
      { name: '中京区三条通オフィスビル新築工事', client: '滋賀設備工事', amount: 4800000, startDate: '2024/06/01', endDate: '2024/08/30', status: '提案中', notes: '概算見積提出済み。' },
      { name: '下鴨神社周辺戸建住宅リノベーション', client: '大阪内装クリエイト', amount: 28340000, startDate: '2024/07/20', endDate: '2024/12/15', status: '見積確認中', notes: '資材高騰による再見積依頼あり。' },
      { name: '烏丸御池メディカルモール内装工事', client: '奈良建具製作所', amount: 8500000, startDate: '2024/04/01', endDate: '2025/03/31', status: '受注', notes: '契約締結済み。' },
      { name: '嵐山旅館客室改修工事', client: '京都工務店', amount: 45000000, startDate: '2024/05/01', endDate: '2024/09/30', status: '失注', notes: '価格競争力により失注。' },
      { name: '丹波黒豆工場改築工事', client: '兵庫建設', amount: 18900000, startDate: '2024/08/15', endDate: '2025/06/30', status: '受注', notes: '地元企業との協業案件。' },
      { name: '福知山駅前商業施設新築', client: '福知山市役所', amount: 52000000, startDate: '2024/09/01', endDate: '2025/12/31', status: '提案中', notes: '公共事業。入札予定。' },
      { name: '伏見港湾倉庫拡張工事', client: 'トランスポート関西', amount: 16200000, startDate: '2024/10/01', endDate: '2025/05/15', status: '見積確認中', notes: '急工程での完成要望あり。' },
      { name: '長岡京医療施設増築工事', client: '日本赤十字', amount: 35000000, startDate: '2024/07/01', endDate: '2025/08/30', status: '未対応', notes: '設計図面まだ未確定。' },
      { name: '南丹市庁舎耐震補強工事', client: '南丹市役所', amount: 24500000, startDate: '2024/11/01', endDate: '2025/09/30', status: '受注', notes: '施工実績が必要な物件。' },
    ];
    const insertProject = db.prepare('INSERT INTO projects (name, client, amount, startDate, endDate, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
    projects.forEach(p => insertProject.run(p.name, p.client, p.amount, p.startDate, p.endDate, p.status, p.notes));

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
      { project_id: 1, category: '仮設工事', vendor: 'なにわ建設株式会社', estimate: 2500000, planned: 2300000, decided: 2200000, status: '決定済み', details: '仮設工事一式', site: '京都四条烏丸店舗', period_start: '2024/04/06', period_end: '2024/05/08', handover: '2024年5月末日', payment: '引き渡し月月末締め翌々月5日振込' },
      { project_id: 1, category: '土工事・地盤改良', vendor: '播磨土木エンジニアリング', estimate: 3800000, planned: 3600000, decided: 3500000, status: '発注完了', details: '地盤調査及び改良工事', site: '京都四条烏丸店舗', period_start: '2024/04/06', period_end: '2024/05/08', handover: '2024年5月末日', payment: '引き渡し月月末締め翌々月5日振込' },
      { project_id: 2, category: '基礎工事', vendor: 'なにわ建設株式会社', estimate: 4200000, planned: 4000000, decided: 3900000, status: '決定済み', details: 'RC造基礎工事', site: '京都四条烏丸店舗', period_start: '2024/04/06', period_end: '2024/05/08', handover: '2024年5月末日', payment: '引き渡し月月末締め翌々月5日振込' },
      { project_id: 2, category: '躯体工事', vendor: '京都冷熱工業所', estimate: 5600000, planned: 5400000, decided: null, status: '見積待ち', details: 'SRC造躯体工事', site: '京都四条烏丸店舗', period_start: '2024/04/06', period_end: '2024/05/08', handover: '2024年5月末日', payment: '引き渡し月月末締め翌々月5日振込' },
      { project_id: 3, category: '屋根工事', vendor: '関西電設工業', estimate: 1800000, planned: 1700000, decided: 1650000, status: '発注完了', details: 'アスファルト防水屋根', site: '京都四条烏丸店舗', period_start: '2024/04/06', period_end: '2024/05/08', handover: '2024年5月末日', payment: '引き渡し月月末締め翌々月5日振込' },
      { project_id: 3, category: '建具工事', vendor: '京都建具製作所', estimate: 2400000, planned: 2300000, decided: 2250000, status: '決定済み', details: 'アルミサッシ取付', site: '京都四条烏丸店舗', period_start: '2024/04/06', period_end: '2024/05/08', handover: '2024年5月末日', payment: '引き渡し月月末締め翌々月5日振込' },
      { project_id: 4, category: '内装工事', vendor: '大阪内装クリエイト', estimate: 3100000, planned: 2900000, decided: 2800000, status: '発注完了', details: 'クロス、床仕上工事', site: '京都四条烏丸店舗', period_start: '2024/04/06', period_end: '2024/05/08', handover: '2024年5月末日', payment: '引き渡し月月末締め翌々月5日振込' },
      { project_id: 5, category: '電気設備工事', vendor: '関西電設工業', estimate: 2200000, planned: 2100000, decided: null, status: '未処理', details: '電気配線、照明工事', site: '京都四条烏丸店舗', period_start: '2024/04/06', period_end: '2024/05/08', handover: '2024年5月末日', payment: '引き渡し月月末締め翌々月5日振込' },
      { project_id: 5, category: '給排水衛生工事', vendor: '京都冷熱工業所', estimate: 1900000, planned: 1800000, decided: 1750000, status: '決定済み', details: '給排水配管工事', site: '京都四条烏丸店舗', period_start: '2024/04/06', period_end: '2024/05/08', handover: '2024年5月末日', payment: '引き渡し月月末締め翌々月5日振込' },
      { project_id: 6, category: '空調設備工事', vendor: '関西環境施工', estimate: 2800000, planned: 2600000, decided: 2500000, status: '見積待ち', details: '空調機器取付工事', site: '京都四条烏丸店舗', period_start: '2024/04/06', period_end: '2024/05/08', handover: '2024年5月末日', payment: '引き渡し月月末締め翌々月5日振込' },
    ];
    const insertOrder = db.prepare('INSERT INTO orders (project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    orders.forEach(o => insertOrder.run(o.project_id, o.category, o.vendor, o.estimate, o.planned, o.decided, o.status, o.details, o.site, o.period_start, o.period_end, o.handover, o.payment));
  }
}

initDB();

// Projects API
app.get('/api/projects', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY id').all();
  res.json(projects);
});

app.post('/api/projects', (req, res) => {
  const { name, client, amount, startDate, endDate, status, notes } = req.body;
  const result = db.prepare('INSERT INTO projects (name, client, amount, startDate, endDate, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(name, client, amount, startDate, endDate, status, notes);
  res.json({ id: result.lastInsertRowid, ...req.body });
});

app.put('/api/projects/:id', (req, res) => {
  const { name, client, amount, startDate, endDate, status, notes } = req.body;
  db.prepare('UPDATE projects SET name=?, client=?, amount=?, startDate=?, endDate=?, status=?, notes=? WHERE id=?').run(name, client, amount, startDate, endDate, status, notes, req.params.id);
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
  const { project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment } = req.body;
  db.prepare('UPDATE orders SET project_id=?, category=?, vendor=?, estimate=?, planned=?, decided=?, status=?, details=?, site=?, period_start=?, period_end=?, handover=?, payment=? WHERE id=?').run(project_id, category, vendor, estimate, planned, decided, status, details, site, period_start, period_end, handover, payment, req.params.id);
  res.json({ id: req.params.id, ...req.body });
});

app.delete('/api/orders/:id', (req, res) => {
  db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Cache endpoint - returns all data at once
app.get('/api/cache', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY id').all();
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY id').all();
  const categories = db.prepare('SELECT * FROM categories ORDER BY "order"').all();
  const orders = db.prepare('SELECT * FROM orders ORDER BY id').all();
  res.json({ projects, vendors, categories, orders });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
