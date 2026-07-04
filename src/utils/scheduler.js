const cron = require('node-cron');
const orderService = require('../services/orderService');
const dateUtils = require('./date');
const config = require('../config');

function formatOrdersList(orders) {
  if (!orders.length) return '';
  return orders
    .map((o) => {
      const time = o.delivery_time || '—';
      const product = o.product_name || '—';
      const client = o.client_name || o.client_username || `id${o.client_id}`;
      const phone = o.phone || '—';
      return `• ${time} — ${product} (${client}, ${phone})`;
    })
    .join('\n');
}

function sendMorningSummary(bot) {
  if (!config.adminTelegramId) {
    console.log('Планировщик: ADMIN_TELEGRAM_ID не задан, утреннее приветствие не отправлено');
    return;
  }

  const today = dateUtils.todayStr();
  const tomorrow = dateUtils.addDays(today, 1);

  const todayOrders = orderService.getOrdersByDate(today);
  const tomorrowOrders = orderService.getOrdersByDate(tomorrow);

  if (!todayOrders.length && !tomorrowOrders.length) {
    console.log('Планировщик: заказов на сегодня и завтра нет, сообщение не отправлено');
    return;
  }

  const todayText = todayOrders.length
    ? `Сегодня выдаем заказы:\n${formatOrdersList(todayOrders)}`
    : '';
  const tomorrowText = tomorrowOrders.length
    ? `Заказы к выдаче на завтра:\n${formatOrdersList(tomorrowOrders)}`
    : '';

  const message = [
    'Доброе утро! Желаю отличного дня и отправляю список ближайших заказов',
    todayText,
    tomorrowText,
  ]
    .filter(Boolean)
    .join('\n\n');

  bot.sendMessage(config.adminTelegramId, message)
    .then(() => console.log('Планировщик: утреннее приветствие отправлено'))
    .catch((err) => console.error('Планировщик: ошибка отправки приветствия:', err.message));
}

function startScheduler(bot) {
  // Ежедневно в 9:00 по московскому времени (UTC+3). node-cron работает в системном часовом поясе.
  cron.schedule('0 9 * * *', () => {
    console.log('Планировщик: запуск утреннего приветствия');
    sendMorningSummary(bot);
  });

  console.log('Планировщик утренних приветствий запущен (9:00)');
}

module.exports = { startScheduler, sendMorningSummary };
