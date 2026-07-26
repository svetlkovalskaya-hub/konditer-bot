const db = require('../db');

function createRecipe(data) {
  const stmt = db.prepare(`
    INSERT INTO recipes (user_id, title, source_url, image_url, image_path, ingredients, instructions, portions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    data.user_id,
    data.title || null,
    data.source_url || null,
    data.image_url || null,
    data.image_path || null,
    data.ingredients || null,
    data.instructions || null,
    data.portions || null
  );
  return { id: info.lastInsertRowid };
}

function getRecipeByIdAndUser(id, user_id) {
  return db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(id, user_id);
}

function getRecipesByUser(user_id, limit = 20, offset = 0) {
  return db
    .prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?')
    .all(user_id, limit, offset);
}

function countRecipesByUser(user_id) {
  const row = db.prepare('SELECT COUNT(*) as count FROM recipes WHERE user_id = ?').get(user_id);
  return row ? row.count : 0;
}

function updateRecipe(id, user_id, fields) {
  const allowed = ['title', 'source_url', 'image_url', 'image_path', 'ingredients', 'instructions', 'portions'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return { ok: false, error: 'no_fields' };

  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k] || null);
  values.push(id, user_id);

  const stmt = db.prepare(`UPDATE recipes SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`);
  const info = stmt.run(...values);
  return { ok: info.changes > 0 };
}

function deleteRecipe(id, user_id) {
  const info = db.prepare('DELETE FROM recipes WHERE id = ? AND user_id = ?').run(id, user_id);
  return { ok: info.changes > 0 };
}

function searchByTitle(user_id, query, limit = 20) {
  return db
    .prepare('SELECT * FROM recipes WHERE user_id = ? AND title LIKE ? ORDER BY title LIMIT ?')
    .all(user_id, `%${query}%`, limit);
}

function searchByIngredient(user_id, query, limit = 20) {
  return db
    .prepare('SELECT * FROM recipes WHERE user_id = ? AND ingredients LIKE ? ORDER BY title LIMIT ?')
    .all(user_id, `%${query}%`, limit);
}

function normalizeSourceUrl(source_url) {
  if (!source_url) return '';
  try {
    const url = new URL(source_url);
    return `${url.protocol}//${url.host}${url.pathname}`.toLowerCase();
  } catch {
    return source_url.toLowerCase();
  }
}

function findRecipeBySourceUrl(user_id, source_url) {
  if (!source_url) return null;
  const normalized = normalizeSourceUrl(source_url);
  const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(user_id);
  return recipes.find((r) => normalizeSourceUrl(r.source_url) === normalized) || null;
}

module.exports = {
  createRecipe,
  getRecipeByIdAndUser,
  getRecipesByUser,
  countRecipesByUser,
  updateRecipe,
  deleteRecipe,
  searchByTitle,
  searchByIngredient,
  findRecipeBySourceUrl,
};
