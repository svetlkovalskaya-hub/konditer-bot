const db = require('../db');

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function isDateBlocked(dateStr) {
  const row = db.prepare('SELECT id FROM blocked_dates WHERE date = ?').get(dateStr);
  return !!row;
}

const MAX_ORDERS_PER_DATE = 5;

function countOrdersOnDate(dateStr, excludeOrderId = null) {
  let sql = 'SELECT COUNT(*) as count FROM orders WHERE delivery_date = ? AND status != ?';
  const params = [dateStr, 'cancelled'];
  if (excludeOrderId) {
    sql += ' AND id != ?';
    params.push(excludeOrderId);
  }
  const row = db.prepare(sql).get(...params);
  return row ? row.count : 0;
}

function isDateAvailable(dateStr, excludeOrderId = null) {
  return !isDateBlocked(dateStr) && countOrdersOnDate(dateStr, excludeOrderId) < MAX_ORDERS_PER_DATE;
}

function getAvailableDates(fromDateStr, limit = 10) {
  const result = [];
  const current = new Date(fromDateStr + 'T00:00:00');
  while (result.length < limit) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (isDateAvailable(dateStr)) {
      result.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function createOrder(order) {
  if (!isDateAvailable(order.delivery_date)) {
    const alternatives = getAvailableDates(order.delivery_date, 5);
    return {
      ok: false,
      error: 'date_unavailable',
      alternatives,
    };
  }

  const stmt = db.prepare(`
    INSERT INTO orders (
      client_id, client_name, client_username, product_id, product_name,
      delivery_date, delivery_time, address, is_pickup, phone, comment, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    order.client_id,
    order.client_name || null,
    order.client_username || null,
    order.product_id || null,
    order.product_name || null,
    order.delivery_date,
    order.delivery_time || null,
    order.address || null,
    order.is_pickup ? 1 : 0,
    order.phone || null,
    order.comment || null,
    order.status || 'создан'
  );

  return {
    ok: true,
    orderId: info.lastInsertRowid,
  };
}

function addOrderPhoto(orderId, fileId, localPath) {
  return db.prepare(
    'INSERT INTO order_photos (order_id, file_id, local_path) VALUES (?, ?, ?)'
  ).run(orderId, fileId, localPath || null);
}

function getOrderPhotos(orderId) {
  return db.prepare('SELECT * FROM order_photos WHERE order_id = ?').all(orderId);
}

function getOrderById(orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

function getOrders(status = null, limit = 50) {
  let sql = 'SELECT * FROM orders';
  const params = [];
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY delivery_date ASC, delivery_time ASC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

function searchOrdersByClientName(name, limit = 50) {
  const sql = 'SELECT * FROM orders WHERE client_name LIKE ? AND status != ? ORDER BY delivery_date ASC, delivery_time ASC LIMIT ?';
  return db.prepare(sql).all(`%${name}%`, 'cancelled', limit);
}

function searchOrdersByPhone(phone, limit = 50) {
  const sql = "SELECT * FROM orders WHERE phone LIKE ? AND status != ? ORDER BY delivery_date ASC, delivery_time ASC LIMIT ?";
  return db.prepare(sql).all(`%${phone}%`, 'cancelled', limit);
}

function deleteOrder(orderId) {
  const info = db.prepare(
    "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run('cancelled', orderId);
  return { ok: info.changes > 0 };
}

function updateOrderStatus(orderId, status) {
  return db.prepare(
    "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(status, orderId);
}

function rescheduleOrder(orderId, newDate) {
  const order = getOrderById(orderId);
  if (!order) return { ok: false, error: 'not_found' };
  if (order.status === 'cancelled') return { ok: false, error: 'cancelled' };

  if (!isDateAvailable(newDate, orderId)) {
    const alternatives = getAvailableDates(newDate, 5);
    return { ok: false, error: 'date_unavailable', alternatives };
  }

  db.prepare(
    "UPDATE orders SET delivery_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(newDate, orderId);

  return { ok: true, orderId };
}

function blockDate(dateStr, reason = null) {
  try {
    db.prepare('INSERT INTO blocked_dates (date, reason) VALUES (?, ?)').run(dateStr, reason);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'already_blocked' };
  }
}

function unblockDate(dateStr) {
  const info = db.prepare('DELETE FROM blocked_dates WHERE date = ?').run(dateStr);
  return { ok: info.changes > 0 };
}

function getBlockedDates() {
  return db.prepare('SELECT * FROM blocked_dates ORDER BY date').all();
}

function getProducts(activeOnly = true) {
  let sql = 'SELECT * FROM products';
  if (activeOnly) sql += ' WHERE is_active = 1';
  sql += ' ORDER BY id';
  return db.prepare(sql).all();
}

function addProduct(name, description = null) {
  const info = db.prepare(
    'INSERT INTO products (name, description) VALUES (?, ?)'
  ).run(name, description);
  return { ok: true, productId: info.lastInsertRowid };
}

function setAdmin(telegramId, name = null) {
  const info = db.prepare(
    'INSERT INTO admins (telegram_id, name) VALUES (?, ?) ON CONFLICT(telegram_id) DO UPDATE SET name = excluded.name'
  ).run(String(telegramId), name);
  return { ok: true };
}

function isAdmin(telegramId) {
  const row = db.prepare('SELECT id FROM admins WHERE telegram_id = ?').get(String(telegramId));
  return !!row;
}

module.exports = {
  formatDate,
  isDateAvailable,
  getAvailableDates,
  createOrder,
  addOrderPhoto,
  getOrderPhotos,
  getOrderById,
  getOrders,
  searchOrdersByClientName,
  searchOrdersByPhone,
  deleteOrder,
  updateOrderStatus,
  rescheduleOrder,
  blockDate,
  unblockDate,
  getBlockedDates,
  getProducts,
  addProduct,
  setAdmin,
  isAdmin,
};
