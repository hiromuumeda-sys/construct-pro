-- ============================================================
-- WIN WIN様 デモ — Supabase / PostgreSQL スキーマ＆初期データ
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- （再実行で初期状態に戻ります：全テーブルを DROP→再作成→シード）
-- ============================================================

drop table if exists payment_records cascade;
drop table if exists invitations cascade;
drop table if exists order_files cascade;
drop table if exists audit_logs cascade;
drop table if exists users cascade;
drop table if exists invoices cascade;
drop table if exists receipts cascade;
drop table if exists orders cascade;
drop table if exists categories cascade;
drop table if exists customers cascade;
drop table if exists vendors cascade;
drop table if exists projects cascade;

-- ユーザー
create table users (
  id            serial primary key,
  email         text not null unique,
  password_hash text not null,
  name          text,
  role          text default 'user',
  created_at    timestamp default current_timestamp,
  updated_at    timestamp default current_timestamp
);

-- 操作履歴
create table audit_logs (
  id            serial primary key,
  user_id       integer references users(id),
  action        text,
  table_name    text,
  record_id     integer,
  details       jsonb,
  created_at    timestamp default current_timestamp
);

-- 案件
create table projects (
  id            serial primary key,
  name          text not null,
  client        text not null,
  "clientCompany" text,
  "clientPhone"   text,
  "clientEmail"   text,
  "clientAddress" text,
  amount        bigint,
  "startDate"     text,
  "endDate"       text,
  status        text,
  notes         text,
  project_no    text,
  receipt_status text,
  delivery_month text,
  process_info   text
);

-- 協力業者（発注先）
create table vendors (
  id            text primary key,
  company       text not null,
  dept          text,
  contact       text,
  email         text,
  phone         text,
  address       text,
  categories    text default '',
  bank_name     text,
  bank_branch   text,
  bank_type     text,
  bank_number   text,
  bank_holder   text
);

-- 工事区分
create table categories (
  id      serial primary key,
  code    text not null,
  name    text not null,
  "order" integer,
  note    text
);

-- 注文（工事計画明細）
create table orders (
  id            serial primary key,
  project_id    integer not null references projects(id) on delete cascade,
  category      text,
  vendor        text,
  estimate      bigint,
  planned       bigint,
  decided       bigint,
  status        text,
  details       text,
  site          text,
  period_start  text,
  period_end    text,
  handover      text,
  payment       text default '月末締翌月末払い',
  "paymentStatus" text default '未払い',
  "paymentDate"   text,
  "paymentNotes"  text,
  ack_done        boolean,
  invoice_done    boolean,
  remaining       bigint,
  order_no        text,
  assignee        text
);

-- 添付書類（請書/請求書のPDF）。orders × kind ごとに1件。
create table order_files (
  order_id    integer references orders(id) on delete cascade,
  kind        text,
  filename    text,
  data_url    text,
  uploaded_at timestamp default current_timestamp,
  primary key (order_id, kind)
);

-- 添付書類（契約書等のPDF）。projects × kind ごとに1件。order_filesと同じ方式（DB直接保存）
create table project_files (
  project_id  integer references projects(id) on delete cascade,
  kind        text,
  filename    text,
  data_url    text,
  uploaded_at timestamp default current_timestamp,
  primary key (project_id, kind)
);

-- 支払登録明細（消し込み履歴）
create table payment_records (
  id         serial primary key,
  order_id   integer references orders(id) on delete cascade,
  paid_date  text,
  amount     bigint,
  note       text,
  created_at timestamp default current_timestamp
);

-- 案件外の支払（工事外費用・給与その他）。工事計画（orders）に紐づかない支払を管理
create table misc_payments (
  id           serial primary key,
  category     text,
  type         text default '支払', -- 支払 | 返金
  payee        text,
  amount       bigint,
  payment_date text,
  status       text default '未払い', -- 未払い | 部分払い | 支払済み
  notes        text,
  created_at   timestamp default current_timestamp
);

-- 案件外の入金（案件に紐づかない売上・雑収入等）
create table misc_receipts (
  id           serial primary key,
  category     text,
  type         text default '入金', -- 入金 | 返金
  payer        text,
  amount       bigint,
  receipt_date text,
  status       text default '未入金', -- 未入金 | 一部入金 | 入金済
  notes        text,
  created_at   timestamp default current_timestamp
);

-- アカウント招待（24時間有効の発行リンク）
create table invitations (
  id          serial primary key,
  email       text not null,
  name        text,
  role        text not null default 'staff',
  token       text not null unique,
  expires_at  timestamp not null,
  accepted_at timestamp,
  created_by  integer,
  created_at  timestamp default current_timestamp
);

-- 顧客
create table customers (
  id          serial primary key,
  company     text not null,
  department  text,
  contact     text,
  email       text,
  phone       text,
  address     text,
  notes       text
);

-- 入金
create table receipts (
  id            serial primary key,
  project_id    integer references projects(id) on delete cascade,
  received_date text,
  amount        bigint,
  month         text,
  memo          text
);

-- 請求書
create table invoices (
  id              serial primary key,
  project_id      integer references projects(id) on delete cascade,
  invoice_no      text,
  registration_no text,
  invoice_date    text,
  due_date        text,
  subtotal        bigint,
  tax             bigint,
  total           bigint,
  bank_info       text,
  status          text default '発行済'
);

-- 外部キー相当カラムのインデックス（Postgresは外部キーに自動でインデックスを張らないため明示）
create index idx_orders_project_id on orders(project_id);
create index idx_receipts_project_id on receipts(project_id);
create index idx_invoices_project_id on invoices(project_id);
create index idx_payment_records_order_id on payment_records(order_id);
create index idx_audit_logs_table_created on audit_logs(table_name, created_at desc);

-- ============ 初期データ ============

insert into projects (name, client, "clientCompany", "clientPhone", "clientEmail", "clientAddress", amount, "startDate", "endDate", status, notes) values
('京都御所南マンション改修工事',       '京都工務店',     '(株)京都工務',         '075-123-4567','contact@kyoto-koumuten.jp','京都府京都市中京区', 12500000,'2025/05/10','2026/03/31','受注',     '契約締結済み。仮設計画確認中。'),
('中京区三条通オフィスビル新築工事',   '滋賀設備工事',   '滋賀設備工事(株)',      '077-567-8901','info@shiga-setubi.co.jp',  '滋賀県大津市',       4800000,'2025/06/01','2025/08/30','提案中',   '概算見積提出済み。'),
('下鴨神社周辺戸建住宅リノベーション','大阪内装クリエイト','大阪内装(株)',        '06-234-5678', 'sales@osaka-naikusou.jp',  '大阪府大阪市北区',  28340000,'2025/07/20','2025/12/15','見積確認中','資材高騰による再見積依頼あり。'),
('烏丸御池メディカルモール内装工事',   '奈良建具製作所', '(株)奈良建具',         '0742-789-0123','nara@tategu.jp',          '奈良県奈良市',       8500000,'2026/04/01','2026/09/30','受注',     '契約締結済み。着手金入金確認済み。'),
('嵐山旅館客室改修工事',               '京都工務店',     '(株)京都工務',         '075-123-4567','contact@kyoto-koumuten.jp','京都府京都市右京区',45000000,'2025/05/01','2026/03/30','受注',     '進行中。中間金入金済み。'),
('丹波黒豆工場改築工事',               '兵庫建設',       '兵庫建設(株)',          '079-345-6789','hyogo@kensetsu.jp',        '兵庫県丹波市',      18900000,'2026/02/01','2026/06/30','受注',     '地元企業との協業案件。'),
('福知山駅前商業施設新築',             '福知山市役所',   '福知山市役所',          '0773-901-2345','projects@fukuchiyama.jp', '京都府福知山市',    52000000,'2025/09/01','2026/12/31','提案中',   '公共事業。入札予定。'),
('伏見港湾倉庫拡張工事',               'トランスポート関西','トランスポート関西(株)','075-456-7890','kowan@transport-kansai.jp','京都府京都市伏見区',16200000,'2025/10/01','2026/05/15','見積確認中','急工程での完成要望あり。'),
('長岡京医療施設増築工事',             '日本赤十字',     '日本赤十字社',          '075-567-8901','medical@jrc.or.jp',        '京都府長岡京市',    35000000,'2026/06/01','2027/03/31','受注',     '設計図面まだ未確定。着手金請求済み。'),
('南丹市庁舎耐震補強工事',             '南丹市役所',     '南丹市役所',            '0771-678-9012','kenchiku@nantan.jp',      '京都府南丹市',      24500000,'2026/05/01','2026/12/31','受注',     '施工実績が必要な物件。');

-- 工番 WW7-xxxx を自動採番
update projects set project_no = 'WW7-' || lpad(id::text, 4, '0');

insert into vendors (id, company, dept, contact, email, phone, address) values
('001','なにわ建設株式会社',      '建築部',     '田中 一郎','i.tanaka@naniwa-con.co.jp',           '06-6123-4567', '大阪府大阪市北区梅田'),
('002','京都冷熱工業所',          '施工課',     '山口 慎二','s.yamaguchi@kyoto-reinet.jp',         '075-341-8899', '京都府京都市下京区烏丸通'),
('003','播磨土木エンジニアリング','土木課',     '藤本 剛',  't.fujimoto@harima-eng.com',           '078-234-5678', '兵庫県姫路市飾磨区'),
('004','関西電設工業',            '電気工事部', '佐藤 太郎','taro.sato@kansai-densetsu.co.jp',     '077-512-3456', '滋賀県大津市中央'),
('005','大阪内装クリエイト',      '内装設計課', '山田 花子','hanako.yamada@osaka-insou.co.jp',      '06-6789-0123', '大阪府大阪市中央区'),
('006','京都建具製作所',          '製造部',     '鈴木 次郎','jiro.suzuki@kyoto-tategu.co.jp',       '075-623-4567', '京都府京都市伏見区'),
('007','奈良建材商社',            '営業部',     '伊藤 花美','hanami.ito@nara-kenzai.co.jp',         '0742-34-5678', '奈良県奈良市二条'),
('008','トランスポート関西',      '施設管理課', '田中 美咲','misaki.tanaka@transport-kansai.co.jp', '078-901-2345', '兵庫県神戸市中央区'),
('009','日本赤十字施設部',        '施設建設課', '鈴木 敏夫','toshio.suzuki@jrc-facility.jp',        '03-1234-5678', '京都府京都市上京区'),
('010','関西環境施工',            '工事部',     '高橋 健一','kenichi.takahashi@kankyo-sekkou.co.jp','06-5432-1098', '大阪府堺市中区');

-- 発注先の口座情報
update vendors set bank_name='三菱UFJ銀行',     bank_branch='梅田支店', bank_type='普通', bank_number='1234567', bank_holder='ナニワケンセツ(カ'          where id='001';
update vendors set bank_name='京都銀行',         bank_branch='烏丸支店', bank_type='普通', bank_number='2345678', bank_holder='キヨウトレイネツ'            where id='002';
update vendors set bank_name='三井住友銀行',     bank_branch='姫路支店', bank_type='当座', bank_number='3456789', bank_holder='ハリマドボク(カ'            where id='003';
update vendors set bank_name='滋賀銀行',         bank_branch='大津支店', bank_type='普通', bank_number='4567890', bank_holder='カンサイデンセツ'            where id='004';
update vendors set bank_name='りそな銀行',       bank_branch='本町支店', bank_type='普通', bank_number='5678901', bank_holder='オオサカナイソウ'            where id='005';
update vendors set bank_name='京都中央信用金庫', bank_branch='伏見支店', bank_type='普通', bank_number='6789012', bank_holder='キヨウトタテグ'              where id='006';
update vendors set bank_name='南都銀行',         bank_branch='奈良支店', bank_type='普通', bank_number='7890123', bank_holder='ナラケンザイ'                where id='007';
update vendors set bank_name='三菱UFJ銀行',     bank_branch='三宮支店', bank_type='当座', bank_number='8901234', bank_holder='トランスポートカンサイ'      where id='008';
update vendors set bank_name='みずほ銀行',       bank_branch='上京支店', bank_type='普通', bank_number='9012345', bank_holder='ニホンセキジユウジ'          where id='009';
update vendors set bank_name='池田泉州銀行',     bank_branch='堺支店',   bank_type='普通', bank_number='0123456', bank_holder='カンサイカンキヨウ'          where id='010';

insert into categories (code, name, "order", note) values
('00001','仮設工事',         1, '共通仮設、直接仮設。'),
('00002','土工事・地盤改良', 2, '京都盆地特有の粘土層対応。'),
('00003','基礎工事',         3, 'RC造基礎、杭打ち工事。'),
('00004','躯体工事',         4, 'SRC造、RC造躯体。'),
('00005','屋根工事',         5, 'アスファルト、金属屋根。'),
('00006','建具工事',         6, 'サッシ、ドア、建具取付。'),
('00007','内装工事',         7, 'クロス、床、天井仕上。'),
('00008','電気設備工事',     8, '配線、照明、受変電。'),
('00009','給排水衛生工事',   9, '給水配管、排水管、衛生器具。'),
('00010','空調設備工事',    10, 'エアコン、換気設備。');

insert into customers (company, department, contact, email, phone, address, notes) values
('(株)京都工務',         '営業部',     '山田 太郎', 'contact@kyoto-koumuten.jp',  '075-123-4567', '京都府京都市中京区',   '老舗施工企業。品質重視。'),
('滋賀設備工事(株)',     '工事部',     '田中 花子', 'info@shiga-setubi.co.jp',    '077-567-8901', '滋賀県大津市',         '設備工事専門。納期厳守。'),
('大阪内装(株)',         '営業課',     '佐藤 次郎', 'sales@osaka-naikusou.jp',    '06-234-5678',  '大阪府大阪市北区',     '内装デザイン力が強み。'),
('(株)奈良建具',         '製造部',     '鈴木 美咲', 'nara@tategu.jp',             '0742-789-0123','奈良県奈良市',         '建具製作納期は3週間。'),
('兵庫建設(株)',         '営業部',     '山本 健太', 'hyogo@kensetsu.jp',          '079-345-6789', '兵庫県丹波市',         '地域密着型。親切。'),
('福知山市役所',         '都市建設課', '高橋 健一', 'projects@fukuchiyama.jp',    '0773-901-2345','京都府福知山市',       '公共事業。予算厳格。入札対応。'),
('トランスポート関西(株)','施設部',   '伊藤 由美', 'kowan@transport-kansai.jp',  '075-456-7890', '京都府京都市伏見区',   '物流施設専門。急工程対応。'),
('日本赤十字社',         '施設建設課', '中村 誠一', 'medical@jrc.or.jp',          '075-567-8901', '京都府長岡京市',       '医療施設。安全性重視。機密情報厳禁。'),
('南丹市役所',           '建設課',     '西田 美咲', 'kenchiku@nantan.jp',         '0771-678-9012','京都府南丹市',         '耐震改修案件多。公共工事。'),
('関西電設工業(株)',     '営業部',     '伊藤 太郎', 'info@kansai-densetsu.jp',    '077-512-3456', '滋賀県大津市中央',     '電気工事専門。技術力高い。');

-- 注文明細（10案件 × 10明細 = 100件）
do $$
declare
  cat text[] := array['仮設工事','土工事・地盤改良','基礎工事','躯体工事','屋根工事','建具工事','内装工事','電気設備工事','給排水衛生工事','空調設備工事'];
  ven text[] := array['なにわ建設株式会社','京都冷熱工業所','播磨土木エンジニアリング','関西電設工業','大阪内装クリエイト','京都建具製作所','奈良建材商社','トランスポート関西','日本赤十字施設部','関西環境施工'];
  sts text[] := array['未処理','見積待ち','決定済み','発注完了','支払済み'];
  pid int; i int; est bigint; pst text; pd text;
begin
  for pid in 1..10 loop
    for i in 0..9 loop
      est := 1000000 + (((pid*7 + i*13) % 30) * 100000);
      if i < 3 then
        pst := '支払済み'; pd := '2026-04-05';
      elsif i < 5 then
        pst := '部分払い'; pd := '2026-05-05';
      elsif i < 7 then
        pst := '未払い';   pd := '2026-06-05';
      else
        pst := '未払い';   pd := '2026-05-31'; -- 期限切れ（通知対象）
      end if;
      insert into orders (
        project_id, category, vendor, estimate, planned, decided, status,
        details, site, period_start, period_end, handover, payment,
        "paymentStatus", "paymentDate", "paymentNotes"
      ) values (
        pid, cat[(i % 10) + 1], ven[((pid + i) % 10) + 1],
        est, floor(est*0.95), floor(est*0.90),
        sts[((pid * i + 1) % 5) + 1],
        cat[(i % 10) + 1] || '工事 第' || pid || '工区',
        '京都施工地' || pid || '番',
        '2026-04-01','2026-06-30','2026-07-31',
        '引き渡し月月末締め翌々月5日振込',
        pst, pd, ''
      );
    end loop;
  end loop;
end $$;

-- 残金の初期値＝費用（決定金額）
update orders set remaining = decided;

-- 入金データ（受注案件の着手金・中間金）
insert into receipts (project_id, received_date, amount, month, memo) values
(1, '2025-06-10', 3750000, '2025年6月', '着手金（契約金額の30%）'),
(1, '2025-10-31', 3750000, '2025年10月','中間金（50%到達時）'),
(4, '2026-04-15', 2550000, '2026年4月', '着手金（契約金額の30%）'),
(5, '2025-06-01', 13500000,'2025年6月', '着手金（契約金額の30%）'),
(5, '2025-10-31', 9000000, '2025年10月','中間金（工事50%完了）'),
(5, '2026-02-28', 9000000, '2026年2月', '中間金（工事80%完了）'),
(6, '2026-02-20', 5670000, '2026年2月', '着手金（契約金額の30%）'),
(9, '2026-06-10', 10500000,'2026年6月', '着手金（契約金額の30%）'),
(10,'2026-05-20', 7350000, '2026年5月', '着手金（契約金額の30%）');

-- 請求書データ
insert into invoices (project_id, invoice_no, registration_no, invoice_date, due_date, subtotal, tax, total, bank_info, status) values
(1, 'INV-2025-001', 'T1234567890123', '2025-06-01', '2025-06-30',  3409091,  340909,  3750000, '三菱UFJ銀行 京都支店 普通 1234567 (株)ウィンウィン', '発行済'),
(1, 'INV-2025-002', 'T1234567890123', '2025-10-01', '2025-10-31',  3409091,  340909,  3750000, '三菱UFJ銀行 京都支店 普通 1234567 (株)ウィンウィン', '発行済'),
(4, 'INV-2026-001', 'T1234567890123', '2026-04-01', '2026-04-30',  2318182,  231818,  2550000, '三菱UFJ銀行 京都支店 普通 1234567 (株)ウィンウィン', '発行済'),
(5, 'INV-2025-003', 'T1234567890123', '2025-05-20', '2025-06-10', 12272727, 1227273, 13500000,'三菱UFJ銀行 京都支店 普通 1234567 (株)ウィンウィン', '発行済'),
(5, 'INV-2025-004', 'T1234567890123', '2025-10-15', '2025-10-31',  8181818,  818182,  9000000, '三菱UFJ銀行 京都支店 普通 1234567 (株)ウィンウィン', '発行済'),
(5, 'INV-2026-002', 'T1234567890123', '2026-02-15', '2026-02-28',  8181818,  818182,  9000000, '三菱UFJ銀行 京都支店 普通 1234567 (株)ウィンウィン', '発行済'),
(6, 'INV-2026-003', 'T1234567890123', '2026-02-01', '2026-02-28',  5154545,  515455,  5670000, '三菱UFJ銀行 京都支店 普通 1234567 (株)ウィンウィン', '発行済'),
(9, 'INV-2026-004', 'T1234567890123', '2026-06-01', '2026-06-30',  9545455,  954545, 10500000,'三菱UFJ銀行 京都支店 普通 1234567 (株)ウィンウィン', '発行済'),
(10,'INV-2026-005', 'T1234567890123', '2026-05-10', '2026-05-31',  6681818,  668182,  7350000, '三菱UFJ銀行 京都支店 普通 1234567 (株)ウィンウィン', '未回収');

-- テストユーザー（パスワード: password123 のハッシュ）
-- 実運用では bcrypt など適切なハッシュ関数を使用してください
insert into users (email, password_hash, name, role) values
('admin@example.com', '$2b$10$YourHashedPasswordHere1', 'Admin User', 'admin'),
('user@example.com',  '$2b$10$YourHashedPasswordHere2', 'Test User', 'user');
