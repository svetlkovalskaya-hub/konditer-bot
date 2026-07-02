const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const dataDir = path.resolve(config.dataDir);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'konditer.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    client_name TEXT,
    client_username TEXT,
    product_id INTEGER REFERENCES products(id),
    product_name TEXT,
    delivery_date TEXT NOT NULL,
    delivery_time TEXT,
    address TEXT,
    is_pickup INTEGER DEFAULT 0,
    phone TEXT,
    comment TEXT,
    status TEXT DEFAULT 'создан',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL,
    local_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS blocked_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(delivery_date);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
`);

// Migration: add phone column if it doesn't exist
const phoneColumn = db.prepare("PRAGMA table_info(orders)").all().find((col) => col.name === 'phone');
if (!phoneColumn) {
  db.exec('ALTER TABLE orders ADD COLUMN phone TEXT');
  console.log('Миграция: добавлена колонка phone в таблицу orders');
}

function seedProducts() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (existing.count > 0) return;

  const insert = db.prepare('INSERT INTO products (name, description) VALUES (?, ?)');
  const products = [
    ['Торт', 'Классический торт на заказ'],
    ['Пряники', 'Имбирные или сахарные пряники'],
    ['Зефир', 'Домашний зефир ручной работы'],
    ['Макарон', 'Французские миндальные пирожные'],
    ['Капкейки', 'Капкейки с кремом и декором'],
  ];

  const transaction = db.transaction((items) => {
    for (const item of items) insert.run(item);
  });
  transaction(products);
}

seedProducts();

module.exports = db;
