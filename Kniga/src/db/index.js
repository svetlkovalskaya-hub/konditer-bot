const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const dataDir = path.resolve(config.dataDir);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'recipes.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source_url TEXT,
    image_url TEXT,
    image_path TEXT,
    ingredients TEXT,
    instructions TEXT,
    portions TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes(user_id);
  CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title);
`);

module.exports = db;
